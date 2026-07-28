import { PlanName, SubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";
import { env } from "../config/env";
import { stripeClient } from "../lib/stripeClient";
import { AppError, ForbiddenError, NotFoundError } from "../lib/errors";
import { businessRepository } from "../repositories/businessRepository";
import { userRepository } from "../repositories/userRepository";
import { canEditBusiness } from "./accountRules";
import { planDescription, planPriceInCents, statusFromStripeEvent } from "./billingRules";

// Descobre a qual negócio um evento do Stripe pertence. Três caminhos, porque
// os objetos de evento não são iguais: a sessão de checkout e a subscription
// carregam nosso metadata.businessId; a fatura não carrega, mas referencia a
// subscription e sempre traz o customer.
async function resolveBusinessFromEvent(event: Stripe.Event) {
  const object = event.data.object as unknown as Record<string, unknown>;

  const metadata = object.metadata as Record<string, string> | null | undefined;
  if (metadata?.businessId) {
    return businessRepository.findById(Number(metadata.businessId));
  }

  const subscriptionId = event.type.startsWith("customer.subscription.")
    ? (object.id as string)
    : typeof object.subscription === "string"
      ? object.subscription
      : null;

  if (subscriptionId) {
    const business = await businessRepository.findByStripeSubscriptionId(subscriptionId);
    if (business) {
      return business;
    }
  }

  // Último recurso: o campo `subscription` da fatura mudou de lugar entre
  // versões da API do Stripe, mas `customer` sempre está lá.
  if (typeof object.customer === "string") {
    return businessRepository.findByStripeCustomerId(object.customer);
  }

  return null;
}

export const billingService = {
  async createCheckoutSession(
    businessId: number,
    userBusinessId: number | null,
    adminUserId: number,
    input: { planName: PlanName },
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

    // Reusa o customer se já existe — cada clique em "Assinar" criaria um
    // cliente novo no Stripe sem isso.
    let customerId = business.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeClient.createCustomer({
        name: admin.name,
        email: admin.email,
        businessId,
      });
      customerId = customer.id;
    }

    const session = await stripeClient.createCheckoutSession({
      customerId,
      businessId,
      planName: input.planName,
      amountInCents: planPriceInCents(input.planName),
      productName: planDescription(input.planName),
      successUrl: `${env.webOrigin}/assinatura?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${env.webOrigin}/assinatura`,
    });

    if (!session.url) {
      throw new AppError("Stripe did not return a checkout URL", 502);
    }

    // subscriptionStatus NÃO muda aqui: criar a sessão não é pagar.
    await businessRepository.updateBilling(businessId, {
      planName: input.planName,
      stripeCustomerId: customerId,
    });

    return { checkoutUrl: session.url };
  },

  async confirmCheckout(
    businessId: number,
    userBusinessId: number | null,
    sessionId: string,
  ): Promise<{ subscriptionStatus: SubscriptionStatus }> {
    if (!canEditBusiness(businessId, userBusinessId)) {
      throw new ForbiddenError("You do not have permission to manage this business's subscription");
    }

    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripeClient.retrieveCheckoutSession(sessionId);
    } catch {
      throw new NotFoundError("Checkout session not found");
    }

    // O sessionId vem do cliente, então não vale nada sozinho: quem diz se foi
    // pago é o Stripe, e a sessão ainda precisa ser DESTE negócio — sem este
    // cheque, um ADMIN poderia colar o session_id pago de outro negócio.
    if (session.metadata?.businessId !== String(businessId)) {
      throw new ForbiddenError("This checkout session does not belong to this business");
    }

    if (session.status !== "complete" || session.payment_status !== "paid") {
      // Não é erro: cartão em análise, ou o usuário voltou sem concluir.
      return { subscriptionStatus: business.subscriptionStatus };
    }

    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

    if (subscriptionId) {
      await businessRepository.setStripeSubscriptionId(businessId, subscriptionId);
    }

    await businessRepository.updateSubscriptionStatus(businessId, SubscriptionStatus.ACTIVE);

    return { subscriptionStatus: SubscriptionStatus.ACTIVE };
  },

  async handleWebhook(event: Stripe.Event): Promise<void> {
    const status = statusFromStripeEvent(event.type);
    if (!status) {
      // Evento não mapeado — alto volume, esperado, sem ação.
      return;
    }

    // checkout.session.completed também dispara para sessão não paga (ex.:
    // boleto aguardando compensação). Só "paid" ativa.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") {
        return;
      }
    }

    const business = await resolveBusinessFromEvent(event);
    if (!business) {
      // Evento real do Stripe para uma assinatura que não reconhecemos — não é
      // erro do Stripe (por isso ainda respondemos 200), mas é o sinal
      // operacional que revelaria assinatura órfã. console.warn e não
      // request.log porque o Fastify deste projeto sobe sem `logger`
      // configurado em app.ts: request.log seria um logger nulo.
      console.warn(`Stripe webhook: no Business matches event ${event.type} (${event.id})`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subscriptionId) {
        await businessRepository.setStripeSubscriptionId(business.id, subscriptionId);
      }
    }

    await businessRepository.updateSubscriptionStatus(business.id, status);
  },
};
