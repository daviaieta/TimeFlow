import { PlanName, SubscriptionStatus } from "@prisma/client";

// Mesmos valores publicados na landing (web/app/page.tsx) — único lugar por
// trás dos R$ 49,90 / R$ 89,90 / R$ 179,90 do lado do servidor.
const PLAN_PRICES: Record<PlanName, number> = {
  ESSENCIAL: 49.9,
  PROFISSIONAL: 89.9,
  EQUIPE: 179.9,
};

const PLAN_LABELS: Record<PlanName, string> = {
  ESSENCIAL: "Essencial",
  PROFISSIONAL: "Profissional",
  EQUIPE: "Equipe",
};

export function planPrice(plan: PlanName): number {
  return PLAN_PRICES[plan];
}

export function planDescription(plan: PlanName): string {
  return `Time Flow - Plano ${PLAN_LABELS[plan]}`;
}

const ACTIVE_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const PAST_DUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

// O Asaas não emite evento de "assinatura cancelada" — cancelamento é sempre
// uma ação nossa (fora de escopo aqui). Qualquer evento fora dos dois grupos
// abaixo (PAYMENT_CREATED, PAYMENT_UPDATED, PAYMENT_DELETED, etc.) é
// recebido e ignorado: devolve null, o handler não muda nada.
export function statusFromWebhookEvent(event: string): SubscriptionStatus | null {
  if (ACTIVE_EVENTS.has(event)) {
    return SubscriptionStatus.ACTIVE;
  }

  if (PAST_DUE_EVENTS.has(event)) {
    return SubscriptionStatus.PAST_DUE;
  }

  return null;
}
