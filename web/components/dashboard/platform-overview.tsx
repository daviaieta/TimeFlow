"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { BusinessTable } from "@/components/dashboard/business-table";
import { PlatformTiles } from "@/components/dashboard/platform-tiles";
import { PlatformOverview as PlatformOverviewData } from "@/lib/platform";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className ?? ""}`} />;
}

export function PlatformOverview() {
  const [data, setData] = useState<PlatformOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Devolve uma promise que nunca rejeita: erros de rede viram estado local,
  // para que `await load()` dentro da transition sempre resolva e o
  // `isPending` volte a false mesmo quando o fetch falha.
  const load = useCallback(() => {
    return fetchAdapter<PlatformOverviewData>({
      method: "GET",
      path: "/businesses",
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
  // efeito de montagem quanto no retry manual do botão de erro.
  const runLoad = useCallback(() => {
    startTransition(async () => {
      await load();
    });
  }, [load]);

  useEffect(() => {
    runLoad();
  }, [runLoad]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Plataforma</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Os negócios cadastrados no Time Flow.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium">{error}</p>
          <Button className="mt-4" size="sm" disabled={isPending} onClick={runLoad}>
            {isPending ? "Tentando…" : "Tentar de novo"}
          </Button>
        </div>
      ) : null}

      {!error && !data ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : null}

      {data ? (
        <div className="mt-8">
          <PlatformTiles totals={data.totals} />

          <div className="mt-4">
            {data.businesses.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center">
                <p className="text-sm font-medium">Nenhum negócio cadastrado ainda</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cadastre o primeiro negócio para começar.
                </p>
              </div>
            ) : (
              <BusinessTable businesses={data.businesses} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
