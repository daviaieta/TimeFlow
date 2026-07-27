import { PlanName } from "@prisma/client";
import { asaasClient } from "../lib/asaasClient";
import { AppError, ForbiddenError, NotFoundError } from "../lib/errors";
import { businessRepository } from "../repositories/businessRepository";
import { userRepository } from "../repositories/userRepository";
import { canEditBusiness } from "./accountRules";
import { planDescription, planPrice, statusFromWebhookEvent } from "./billingRules";

interface SubscribeInput {
  planName: PlanName;
  cpfCnpj: string;
}

interface WebhookPayload {
  event: string;
  payment?: { subscription?: string };
}

export const billingService = {
  async subscribe(
    businessId: number,
    userBusinessId: number | null,
    adminUserId: number,
    input: SubscribeInput,
  ): Promise<{ checkoutUrl: string }> {
    // Mesma ordem de PUT /businesses/:id: o gate vem antes de qualquer leitura
    // do alvo, pra não vazar a existência de outro negócio via 404 vs 403.
    if (!canEditBusiness(businessId, userBusinessId)) {
      throw new ForbiddenError("You do not have permission to manage this business's subscription");
    }

    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const admin = await userRepository.findById(adminUserId);
    if (!admin) {
      throw new NotFoundError("Admin user not found");
    }

    // Retry: essa empresa já tem uma assinatura Asaas viva (ex.: ficou
    // PAST_DUE e o ADMIN clicou em "Assinar" de novo). NÃO cria uma segunda
    // assinatura aqui — isso cobraria em dobro e órfã a primeira (os
    // webhooks dela deixariam de bater com qualquer Business, ver
    // handleWebhook abaixo). Em vez disso reusa a assinatura existente e
    // devolve a fatura em aberto dela: é exatamente o que uma empresa
    // PAST_DUE precisa pra pagar. Troca de plano (input.planName diferente do
    // atual) está fora de escopo nesta entrega (spec, "Fora de escopo":
    // upgrade/downgrade) — mesmo assim não criamos assinatura nova; só
    // persistimos o planName localmente.
    if (business.asaasSubscriptionId && business.asaasCustomerId) {
      if (input.cpfCnpj !== business.cpfCnpj) {
        // Corrige no Asaas o cpfCnpj que o cliente está tentando corrigir
        // aqui — sem isso, a correção não muda nada onde importa (a fatura).
        await asaasClient.updateCustomer(business.asaasCustomerId, { cpfCnpj: input.cpfCnpj });
      }

      const payment = await asaasClient.getFirstSubscriptionPayment(business.asaasSubscriptionId);
      if (!payment) {
        throw new AppError("Asaas did not return a payment for the existing subscription", 502);
      }

      await businessRepository.updateBilling(businessId, {
        planName: input.planName,
        asaasCustomerId: business.asaasCustomerId,
        asaasSubscriptionId: business.asaasSubscriptionId,
        cpfCnpj: input.cpfCnpj,
      });

      return { checkoutUrl: payment.invoiceUrl };
    }

    // Reaproveita o customer se essa empresa já tentou assinar antes mas não
    // chegou a criar a assinatura (ex.: falhou entre as duas chamadas) —
    // evita duplicar cliente no Asaas.
    let customerId = business.asaasCustomerId;
    if (!customerId) {
      const customer = await asaasClient.createCustomer({
        name: admin.name,
        email: admin.email,
        cpfCnpj: input.cpfCnpj,
      });
      customerId = customer.id;
    } else if (input.cpfCnpj !== business.cpfCnpj) {
      await asaasClient.updateCustomer(customerId, { cpfCnpj: input.cpfCnpj });
    }

    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);

    const subscription = await asaasClient.createSubscription({
      customer: customerId,
      value: planPrice(input.planName),
      nextDueDate: nextDueDate.toISOString().slice(0, 10),
      description: planDescription(input.planName),
    });

    const payment = await asaasClient.getFirstSubscriptionPayment(subscription.id);
    if (!payment) {
      throw new AppError("Asaas did not return a payment for the new subscription", 502);
    }

    // subscriptionStatus NÃO muda aqui — fica PENDING (ou o que já era) até o
    // webhook confirmar o pagamento de verdade. Marcar ACTIVE neste ponto
    // destravaria o dashboard antes de qualquer dinheiro ter entrado.
    await businessRepository.updateBilling(businessId, {
      planName: input.planName,
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscription.id,
      cpfCnpj: input.cpfCnpj,
    });

    return { checkoutUrl: payment.invoiceUrl };
  },

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    const status = statusFromWebhookEvent(payload.event);
    if (!status) {
      // Evento não mapeado (PAYMENT_CREATED, PAYMENT_UPDATED, etc.) — alto
      // volume, esperado, sem ação — não vale logar.
      return;
    }

    if (!payload.payment?.subscription) {
      // Corpo malformado — baixo valor de log, não é o caso que o spec pede.
      return;
    }

    const business = await businessRepository.findByAsaasSubscriptionId(payload.payment.subscription);
    if (!business) {
      // Chegou um evento de pagamento de verdade pra uma assinatura que não
      // reconhecemos — não é erro do Asaas (não deve gerar retry, por isso
      // ainda respondemos 200), mas é o sinal operacional que teria pego o
      // bug de assinatura duplicada/órfã: vale um warning. console.warn (não
      // request.log) porque o Fastify deste projeto sobe sem `logger`
      // configurado em app.ts — request.log é um logger nulo, silencioso;
      // console.warn é o que o resto do serviço já usa pra isso
      // (businessService.ts usa console.error/console.log do mesmo jeito).
      console.warn(
        `Asaas webhook: no Business matches asaasSubscriptionId=${payload.payment.subscription} (event=${payload.event})`,
      );
      return;
    }

    await businessRepository.updateSubscriptionStatus(business.id, status);
  },
};
