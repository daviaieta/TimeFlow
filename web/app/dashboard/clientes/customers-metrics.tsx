"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/dashboard";
import { CrmMetrics } from "@/lib/types";

// Visão da carteira. Só ADMIN: o servidor responde 403 para a equipe, e
// esconder o bloco evita uma faixa de erro numa tela que funciona.

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-3 text-3xl leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">{hint}</p>
    </div>
  );
}

export function CustomersMetrics() {
  const [metrics, setMetrics] = useState<CrmMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetchAdapter<{ metrics: CrmMetrics }>({
      method: "GET",
      path: "/crm/metrics",
    })
      .then(({ data }) => {
        setMetrics(data.metrics);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Métrica é acessório: se falhar, a lista de clientes continua sendo o
  // conteúdo da página. Some em silêncio em vez de ocupar a tela com um erro.
  if (error) return null;

  if (!metrics) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Clientes"
          value={String(metrics.total)}
          hint={`${metrics.active} ativos · ${metrics.blocked} bloqueados`}
        />
        <Tile
          label="Novos"
          value={String(metrics.newThisMonth)}
          hint="cadastrados nos últimos 30 dias"
        />
        <Tile
          label="Maior valor"
          value={
            metrics.topSpenders.length > 0
              ? formatCurrency(metrics.topSpenders[0].totalSpent)
              : "—"
          }
          hint={metrics.topSpenders[0]?.displayName ?? "ninguém reservou ainda"}
        />
        <Tile
          label="Ativos"
          value={String(metrics.active)}
          hint={
            metrics.total > 0
              ? `${Math.round((metrics.active / metrics.total) * 100)}% da carteira`
              : "carteira vazia"
          }
        />
      </div>

      {metrics.topSpenders.length > 0 && (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <header className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold tracking-tight">
              Quem mais gastou
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Valor reservado, não liquidado — inclui quem não apareceu.
            </p>
          </header>
          <ul className="divide-y">
            {metrics.topSpenders.map((spender) => (
              <li key={spender.publicId}>
                <Link
                  href={`/dashboard/clientes/${spender.publicId}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 text-sm transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0 truncate font-medium">
                    {spender.displayName}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {spender.bookingsCount}{" "}
                    {spender.bookingsCount === 1 ? "reserva" : "reservas"} ·{" "}
                    <span className="font-medium text-foreground">
                      {formatCurrency(spender.totalSpent)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
