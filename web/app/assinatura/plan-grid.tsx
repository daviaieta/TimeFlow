"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PlanName } from "@/lib/auth";

// Mesma copy da landing (web/app/page.tsx) — quem chega aqui vindo de lá tem
// que ver a mesma promessa, com os mesmos preços.
export const PLANS: {
  id: PlanName;
  name: string;
  description: string;
  price: string;
  features: string[];
  highlighted: boolean;
}[] = [
  {
    id: "ESSENCIAL",
    name: "Essencial",
    description: "Para autônomos começando a organizar a agenda.",
    price: "R$ 49,90",
    features: [
      "1 profissional",
      "Página pública de agendamento",
      "Reservas ilimitadas",
      "Confirmação por e-mail",
    ],
    highlighted: false,
  },
  {
    id: "PROFISSIONAL",
    name: "Profissional",
    description: "Para negócios com equipe pequena.",
    price: "R$ 89,90",
    features: [
      "Até 5 profissionais",
      "Tudo do Essencial",
      "Agenda em tempo real",
      "Suporte prioritário",
    ],
    highlighted: true,
  },
  {
    id: "EQUIPE",
    name: "Equipe",
    description: "Para operações maiores, com várias unidades.",
    price: "R$ 179,90",
    features: [
      "Profissionais ilimitados",
      "Tudo do Profissional",
      "Múltiplas unidades",
      "Onboarding dedicado",
    ],
    highlighted: false,
  },
];

export function PlanGrid({
  submittingPlan,
  onSelect,
}: {
  submittingPlan: PlanName | null;
  onSelect: (plan: PlanName) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={`relative flex flex-col rounded-2xl border bg-card p-8 ${
            plan.highlighted
              ? "border-indigo-500 shadow-lg ring-1 ring-indigo-500"
              : "shadow-sm"
          }`}
        >
          {plan.highlighted && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white">
              Mais popular
            </span>
          )}
          <h2 className="text-base font-semibold">{plan.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
          <p className="mt-6 text-3xl font-semibold tracking-tight">{plan.price}</p>
          <p className="mt-1 text-xs text-muted-foreground">/mês</p>

          <ul className="mt-6 flex-1 space-y-3 text-sm">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="size-4 shrink-0 text-cyan-500"
                />
                {feature}
              </li>
            ))}
          </ul>

          <Button
            type="button"
            className="mt-8"
            variant={plan.highlighted ? "default" : "outline"}
            disabled={submittingPlan !== null}
            onClick={() => onSelect(plan.id)}
          >
            {submittingPlan === plan.id ? <Spinner data-icon="inline-start" /> : null}
            {submittingPlan === plan.id ? "Abrindo checkout…" : "Assinar"}
          </Button>
        </div>
      ))}
    </div>
  );
}
