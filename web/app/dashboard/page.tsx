"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { PlaceholderOverview } from "@/components/dashboard/placeholder-overview";
import { DashboardOverview, PeriodDays, formatRangeLabel } from "@/lib/dashboard";
import { useAuthUser } from "./auth-context";

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl bg-muted ${className ?? ""}`} />
  );
}

export default function DashboardPage() {
  const user = useAuthUser();
  const isAdmin = user.role === "ADMIN";

  const [days, setDays] = useState<PeriodDays>(7);
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // `isPending` só liga quando o `startTransition` do efeito de montagem já
  // rodou (pós-commit) — entre a primeira pintura e esse momento ele fica
  // `false` mesmo sem nenhum dado carregado ainda. Gatear o seletor por
  // `data === null` também fecha essa janela: ele começa desabilitado na
  // primeira pintura e só libera quando existe algum dado para trocar de
  // período em cima — mesmo que um primeiro load tenha falhado, o usuário
  // ainda pode reagir pelo botão "Tentar de novo" (que só depende de
  // `isPending`), sem o seletor liberar sem nunca ter havido dado.
  const selectorDisabled = isPending || data === null;

  // Devolve uma promise que nunca rejeita: erros de rede viram estado local,
  // para que `await load(...)` dentro da transition sempre resolva e o
  // `isPending` volte a false mesmo quando o fetch falha.
  const load = useCallback((period: PeriodDays) => {
    return fetchAdapter<DashboardOverview>({
      method: "GET",
      path: `/dashboard/overview?days=${period}`,
    })
      .then(({ data: overview }) => {
        setData(overview);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, []);

  // O fetch roda dentro de uma transition (em vez de um setState síncrono no
  // corpo do efeito) para não disparar o lint `react-hooks/set-state-in-effect`
  // e para que `isPending` sirva como indicador de carregamento — tanto no
  // efeito de troca de período quanto no retry manual do botão de erro.
  const runLoad = useCallback(
    (period: PeriodDays) => {
      startTransition(async () => {
        await load(period);
      });
    },
    [load],
  );

  useEffect(() => {
    if (isAdmin) runLoad(days);
  }, [isAdmin, days, runLoad]);

  if (!isAdmin) return <PlaceholderOverview user={user} />;

  const firstName = user.name.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Olá, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.business
              ? `Como está ${user.business.name} nos próximos ${days} dias.`
              : `Resumo dos próximos ${days} dias.`}
            {data ? (
              <span className="tabular-nums">
                {" "}
                {formatRangeLabel(data.range.from, data.range.to)}.
              </span>
            ) : null}
          </p>
        </div>
        <PeriodSelector value={days} onChange={setDays} disabled={selectorDisabled} />
      </div>

      {error ? (
        <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium">{error}</p>
          <Button
            className="mt-4"
            size="sm"
            disabled={isPending}
            onClick={() => runLoad(days)}
          >
            {isPending ? "Tentando…" : "Tentar de novo"}
          </Button>
        </div>
      ) : null}

      {!error && !data ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : null}

      {data ? (
        // Dados antigos ficam visíveis enquanto o novo período carrega:
        // desmontar faria o layout piscar a cada clique no seletor.
        <div
          aria-busy={isPending}
          className={`mt-8 transition-opacity ${isPending ? "opacity-50" : ""}`}
        >
          <KpiCards kpis={data.kpis} days={data.range.days} />
        </div>
      ) : null}
    </div>
  );
}
