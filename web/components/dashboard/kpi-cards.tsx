import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Calendar03Icon,
  ChartLineData01Icon,
  MoneyBag02Icon,
  PieChartIcon,
} from "@hugeicons/core-free-icons";
import {
  DashboardKpis,
  formatCurrency,
  formatPercent,
  paceDelta,
} from "@/lib/dashboard";
import { cn } from "@/lib/utils";

function Tile({
  label,
  value,
  hint,
  icon,
  children,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Calendar03Icon;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground/60" />
      </div>
      <p className="mt-3 text-3xl leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">{hint}</p>
      {children}
    </div>
  );
}

export function KpiCards({ kpis, days }: { kpis: DashboardKpis; days: number }) {
  const delta = paceDelta(kpis.pace.current, kpis.pace.previous);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Taxa de ocupação"
        value={formatPercent(kpis.occupancy.rate)}
        hint={`${kpis.occupancy.booked} de ${kpis.occupancy.total} horários`}
        icon={PieChartIcon}
      >
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${Math.round(kpis.occupancy.rate * 100)}%` }}
          />
        </div>
      </Tile>

      <Tile
        label="Reservas no período"
        value={String(kpis.bookings.total)}
        hint={`${kpis.bookings.online} pelo site · ${kpis.bookings.manual} encaixes`}
        icon={Calendar03Icon}
      />

      <Tile
        label="Receita agendada"
        value={formatCurrency(kpis.revenue.scheduled)}
        hint={`Ticket médio ${formatCurrency(kpis.revenue.averageTicket)}`}
        icon={MoneyBag02Icon}
      />

      <Tile
        label="Ritmo de reservas"
        value={String(kpis.pace.current)}
        hint={`Criadas nos últimos ${days} dias`}
        icon={ChartLineData01Icon}
      >
        <p
          className={cn(
            "mt-4 inline-flex items-center gap-1 text-xs font-medium tabular-nums",
            delta.direction === "up" && "text-emerald-600 dark:text-emerald-400",
            delta.direction === "down" && "text-destructive",
            delta.direction === "flat" && "text-muted-foreground",
          )}
        >
          {delta.direction !== "flat" ? (
            <HugeiconsIcon
              icon={delta.direction === "up" ? ArrowUp01Icon : ArrowDown01Icon}
              className="size-3.5"
            />
          ) : null}
          {delta.percent === null
            ? `${kpis.pace.previous} no período anterior`
            : `${formatPercent(Math.abs(delta.percent))} vs. ${days} dias anteriores`}
        </p>
      </Tile>
    </div>
  );
}
