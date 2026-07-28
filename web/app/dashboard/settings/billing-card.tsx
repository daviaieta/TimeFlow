"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PlanName, SubscriptionStatus } from "@/lib/auth";
import { cn } from "@/lib/utils";

const PLAN_LABELS: Record<PlanName, string> = {
  ESSENCIAL: "Essencial",
  PROFISSIONAL: "Profissional",
  EQUIPE: "Equipe",
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  PENDING: "Sem assinatura ativa",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento atrasado",
  CANCELED: "Cancelada",
};

// O formulário de planos vive em /assinatura agora — aqui fica só o estado
// atual e o caminho para lá, pra não manter duas telas de cobrança.
export function BillingCard({
  planName,
  subscriptionStatus,
}: {
  planName: PlanName | null;
  subscriptionStatus: SubscriptionStatus;
}) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Assinatura</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Status atual: {STATUS_LABELS[subscriptionStatus]}
        {planName ? ` · Plano ${PLAN_LABELS[planName]}` : ""}
      </p>

      <Link
        href="/assinatura"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-6")}
      >
        {subscriptionStatus === "ACTIVE" ? "Ver planos" : "Ativar assinatura"}
      </Link>
    </section>
  );
}
