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

    // Reaproveita o customer se essa empresa já tentou assinar antes (ex.:
    // estava PAST_DUE e está tentando de novo) — evita duplicar cliente no Asaas.
    let customerId = business.asaasCustomerId;
    if (!customerId) {
      const customer = await asaasClient.createCustomer({
        name: admin.name,
        email: admin.email,
        cpfCnpj: input.cpfCnpj,
      });
      customerId = customer.id;
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
    if (!status || !payload.payment?.subscription) {
      return;
    }

    const business = await businessRepository.findByAsaasSubscriptionId(payload.payment.subscription);
    if (!business) {
      // Assinatura de outro ambiente (ex.: sandbox local de outro dev) ou já
      // removida — não é erro do Asaas, não deve virar retry.
      return;
    }

    await businessRepository.updateSubscriptionStatus(business.id, status);
  },
};
