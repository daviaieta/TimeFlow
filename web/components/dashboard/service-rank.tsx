import { ServiceRankRow, formatCurrency, formatPercent } from "@/lib/dashboard";

export function ServiceRank({ rows }: { rows: ServiceRankRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhuma reserva no período.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium">{row.name}</p>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {formatCurrency(row.revenue)}
            </span>
          </div>

          {/* A barra é participação na receita, não contagem: dois serviços com
              o mesmo número de reservas pesam diferente no caixa. */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.max(Math.round(row.share * 100), 2)}%` }}
            />
          </div>

          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {row.bookings} {row.bookings === 1 ? "reserva" : "reservas"} ·{" "}
            {formatPercent(row.share)} da receita
          </p>
        </li>
      ))}
    </ol>
  );
}
