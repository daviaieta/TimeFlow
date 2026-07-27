"use client";

import { useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PlanName, SubscriptionStatus } from "@/lib/auth";

const PLANS: { id: PlanName; label: string; price: string }[] = [
  { id: "ESSENCIAL", label: "Essencial", price: "R$ 49,90/mês" },
  { id: "PROFISSIONAL", label: "Profissional", price: "R$ 89,90/mês" },
  { id: "EQUIPE", label: "Equipe", price: "R$ 179,90/mês" },
];

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  PENDING: "Sem assinatura ativa",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento atrasado",
  CANCELED: "Cancelada",
};

function translateError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erro inesperado.";
  if (error.status === 400) return "CPF/CNPJ inválido. Confira e tente de novo.";
  return error.message;
}

export function BillingCard({
  businessId,
  planName,
  subscriptionStatus,
}: {
  businessId: number;
  planName: PlanName | null;
  subscriptionStatus: SubscriptionStatus;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanName>(planName ?? "ESSENCIAL");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsPayment = subscriptionStatus !== "ACTIVE";

  async function handleSubscribe() {
    setError(null);
    setSubmitting(true);

    try {
      const { data } = await fetchAdapter<{ checkoutUrl: string }>({
        method: "POST",
        path: `/businesses/${businessId}/subscription`,
        body: { planName: selectedPlan, cpfCnpj: cpfCnpj.replace(/\D/g, "") },
      });

      // Sai do app de propósito: o checkout é hospedado pelo Asaas, não é
      // uma tela nossa — não faz sentido abrir isso dentro do dashboard.
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(translateError(err));
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Assinatura</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Status atual: {STATUS_LABELS[subscriptionStatus]}
        {planName ? ` · Plano ${PLANS.find((p) => p.id === planName)?.label}` : ""}
      </p>

      {needsPayment ? (
        <div className="mt-6">
          <FieldGroup>
            <Field>
              <FieldLabel>Escolha um plano</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-3">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      selectedPlan === plan.id
                        ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500 dark:bg-indigo-950/40"
                        : "border-zinc-200 hover:bg-muted dark:border-zinc-800"
                    }`}
                  >
                    <p className="font-medium">{plan.label}</p>
                    <p className="text-xs text-muted-foreground">{plan.price}</p>
                  </button>
                ))}
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="billing-cpf-cnpj">CPF ou CNPJ</FieldLabel>
              <Input
                id="billing-cpf-cnpj"
                value={cpfCnpj}
                onChange={(event) => setCpfCnpj(event.target.value)}
                placeholder="Só números"
                required
              />
              <FieldDescription>
                Usado só para gerar a cobrança no Asaas.
              </FieldDescription>
            </Field>

            {error ? <FieldError>{error}</FieldError> : null}

            <Field>
              <Button type="button" onClick={handleSubscribe} disabled={submitting}>
                {submitting ? <Spinner data-icon="inline-start" /> : null}
                {submitting ? "Redirecionando…" : "Assinar"}
              </Button>
            </Field>
          </FieldGroup>
        </div>
      ) : null}
    </section>
  );
}
