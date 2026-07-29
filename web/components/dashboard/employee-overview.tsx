"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { AlertsList } from "@/components/dashboard/alerts-list";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { OccupancyChart } from "@/components/dashboard/occupancy-chart";
import { OccupancyHeatmap } from "@/components/dashboard/occupancy-heatmap";
import { Panel } from "@/components/dashboard/panel";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { ServiceRank } from "@/components/dashboard/service-rank";
import { UpcomingList } from "@/components/dashboard/upcoming-list";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthUser } from "@/lib/auth";
import {
  EmployeeOverview as EmployeeOverviewData,
  PeriodDays,
  formatRangeLabel,
} from "@/lib/dashboard";

export function EmployeeOverview({ user }: { user: AuthUser }) {
  const [days, setDays] = useState<PeriodDays>(7);
  const [data, setData] = useState<EmployeeOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Mesma trava do painel do dono: entre a primeira pintura e o commit da
  // transition o `isPending` ainda é false, então `data === null` fecha essa
  // janela em que o seletor apareceria clicável sem nada para trocar.
  const selectorDisabled = isPending || data === null;

  // Devolve uma promise que nunca rejeita: erros de rede viram estado local,
  // para que `await load(...)` dentro da transition sempre resolva e o
  // `isPending` volte a false mesmo quando o fetch falha.
  const load = useCallback((period: PeriodDays) => {
    return fetchAdapter<EmployeeOverviewData>({
      method: "GET",
      path: `/dashboard/me?days=${period}`,
    })
      .then(({ data: overview }) => {
        setData(overview);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, []);

  const runLoad = useCallback(
    (period: PeriodDays) => {
      startTransition(async () => {
        await load(period);
      });
    },
    [load],
  );

  useEffect(() => {
    runLoad(days);
  }, [days, runLoad]);

  const firstName = user.name.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Olá, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua agenda nos próximos {days} dias.
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

          {/* Os próximos atendimentos vêm antes de qualquer gráfico: o
              colaborador abre isto para saber quem chega agora, não para
              estudar a própria ocupação. */}
          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <Panel
              title="Seus próximos atendimentos"
              description="Independente do período selecionado"
              className="lg:col-span-8"
            >
              <UpcomingList rows={data.upcoming} showEmployee={false} />
            </Panel>

            <Panel
              title="Precisa de atenção"
              description="O que trava a sua agenda"
              className="lg:col-span-4"
            >
              <AlertsList alerts={data.alerts} />
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <Panel
              title="Sua ocupação"
              description={data.range.days === 7 ? "Dia a dia" : "Por semana"}
              className="lg:col-span-7"
            >
              <OccupancyChart buckets={data.occupancyByBucket} />
            </Panel>

            <Panel
              title="Seus serviços mais reservados"
              description="Por participação na receita"
              className="lg:col-span-5"
            >
              <ServiceRank rows={data.services} />
            </Panel>
          </div>

          <div className="mt-4 grid gap-4">
            <Panel
              title="Mapa de demanda"
              description="Quando sua agenda enche, por dia da semana e hora"
            >
              <OccupancyHeatmap cells={data.heatmap} />
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
