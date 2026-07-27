import Stripe from "stripe";
import { PlanName } from "@prisma/client";
import { env } from "../config/env";

const stripe = new Stripe(env.stripeSecretKey);

interface CreateCheckoutSessionInput {
  customerId: string;
  businessId: number;
  planName: PlanName;
  amountInCents: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}

export const stripeClient = {
  createCustomer(input: { name: string; email: string; businessId: number }) {
    return stripe.customers.create({
      name: input.name,
      email: input.email,
      metadata: { businessId: String(input.businessId) },
    });
  },

  // price_data inline em vez de um Price pré-cadastrado no painel: mantém
  // billingRules.planPriceInCents como única fonte dos preços, os mesmos que
  // a landing publica.
  createCheckoutSession(input: CreateCheckoutSessionInput) {
    return stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      client_reference_id: String(input.businessId),
      // metadata na sessão identifica o negócio na confirmação e no webhook;
      // subscription_data.metadata carrega o mesmo para a Subscription, que é
      // o objeto referenciado nos eventos de renovação.
      metadata: { businessId: String(input.businessId), planName: input.planName },
      subscription_data: {
        metadata: { businessId: String(input.businessId) },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: input.amountInCents,
            recurring: { interval: "month" },
            product_data: { name: input.productName },
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
  },

  retrieveCheckoutSession(sessionId: string) {
    return stripe.checkout.sessions.retrieve(sessionId);
  },

  // Verificação de assinatura do webhook: HMAC em tempo constante + janela de
  // tolerância de timestamp. Feita pelo SDK de propósito — é criptografia
  // sensível, hand-rolled aqui seria risco sem ganho.
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  },
};
