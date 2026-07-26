"use client";

import { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";

export const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.14em]";
export const FOCUS = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

const TOTAL_STEPS = 4;

interface WizardShellProps {
  step: 1 | 2 | 3 | 4;
  title: string;
  subtitle?: ReactNode;
  businessName: string;
  initials: string;
  /** Ausente no primeiro passo, onde o cabeçalho mostra a marca do negócio. */
  onBack?: () => void;
  children: ReactNode;
  /** Corpo do painel lateral, acima da ação. */
  summary: ReactNode;
  /** Botão principal — o mesmo nó aparece no painel e na barra do mobile. */
  action: ReactNode;
  /** Linha condensada da barra fixa do mobile. */
  mobileSummary?: ReactNode;
}

/**
 * Casca dos quatro passos do agendamento: traço de progresso, cabeçalho,
 * título e o painel de resumo — fixo no desktop, barra presa ao polegar no
 * mobile. Cada passo entra só com o próprio conteúdo.
 */
export function WizardShell({
  step,
  title,
  subtitle,
  businessName,
  initials,
  onBack,
  children,
  summary,
  action,
  mobileSummary,
}: WizardShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* O traço lê antes de qualquer texto. */}
      <div
        role="progressbar"
        aria-label={`Passo ${step} de ${TOTAL_STEPS}`}
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step}
        className="h-0.5 shrink-0 bg-border"
      >
        <div
          className="h-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_400px]">
        <main className="flex flex-col px-5 pb-44 sm:px-8 lg:px-16 lg:pb-16">
          <header className="flex items-center justify-between gap-4 py-4 lg:py-8">
            {onBack ? (
              <>
                <button
                  type="button"
                  onClick={onBack}
                  className={`-ml-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground ${FOCUS}`}
                >
                  <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />
                  Voltar
                </button>
                <span className={`${EYEBROW} truncate text-muted-foreground`}>
                  {businessName}
                </span>
              </>
            ) : (
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-background">
                  {initials}
                </span>
                <p className="truncate text-sm font-medium">{businessName}</p>
              </div>
            )}
          </header>

          <div className="mt-6 lg:mt-14">
            <p className={`${EYEBROW} text-primary`}>
              Passo {step} de {TOTAL_STEPS}
            </p>
            <h1 className="mt-3 text-[30px] font-semibold leading-[1.08] tracking-[-0.025em] lg:text-[44px]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 text-[15px] text-muted-foreground">{subtitle}</p>
            )}
          </div>

          {children}
        </main>

        <aside className="hidden border-l bg-muted/30 lg:block">
          <div className="sticky top-0 flex h-dvh flex-col px-10 py-10">
            <p className={`${EYEBROW} text-muted-foreground`}>Resumo</p>
            {summary}
            <div className="mt-auto pt-10">{action}</div>
          </div>
        </aside>
      </div>

      {mobileSummary && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/85 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-8 lg:hidden">
          {mobileSummary}
          <div className="mt-3">{action}</div>
        </div>
      )}
    </div>
  );
}
