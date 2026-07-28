import { PlanName, SubscriptionStatus } from "@prisma/client";

// Mesmos valores publicados na landing (web/app/page.tsx) — único lugar por
// trás dos R$ 49,90 / R$ 89,90 / R$ 179,90 do lado do servidor.
const PLAN_PRICES: Record<PlanName, number> = {
  ESSENCIAL: 49.9,
  PROFISSIONAL: 89.9,
  EQUIPE: 179.9,
};

// Centavos como literal, não planPrice * 100: 49.9 * 100 dá 4989.999... em
// float, e o Stripe recusa unit_amount não-inteiro.
const PLAN_CENTS: Record<PlanName, number> = {
  ESSENCIAL: 4990,
  PROFISSIONAL: 8990,
  EQUIPE: 17990,
};

const PLAN_LABELS: Record<PlanName, string> = {
  ESSENCIAL: "Essencial",
  PROFISSIONAL: "Profissional",
  EQUIPE: "Equipe",
};

export function planPrice(plan: PlanName): number {
  return PLAN_PRICES[plan];
}

export function planPriceInCents(plan: PlanName): number {
  return PLAN_CENTS[plan];
}

export function planDescription(plan: PlanName): string {
  return `Time Flow - Plano ${PLAN_LABELS[plan]}`;
}

const ACTIVE_EVENTS = new Set(["checkout.session.completed", "invoice.paid"]);
const PAST_DUE_EVENTS = new Set(["invoice.payment_failed"]);
const CANCELED_EVENTS = new Set(["customer.subscription.deleted"]);

// Mapeia só o TIPO do evento. Para checkout.session.completed ainda é preciso
// conferir payment_status === "paid" no próprio objeto — isso fica no
// billingService, que tem o evento inteiro em mãos.
export function statusFromStripeEvent(eventType: string): SubscriptionStatus | null {
  if (ACTIVE_EVENTS.has(eventType)) {
    return SubscriptionStatus.ACTIVE;
  }

  if (PAST_DUE_EVENTS.has(eventType)) {
    return SubscriptionStatus.PAST_DUE;
  }

  if (CANCELED_EVENTS.has(eventType)) {
    return SubscriptionStatus.CANCELED;
  }

  return null;
}
