import { HeatmapCell, formatPercent, heatIntensity } from "@/lib/dashboard";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Rampa de opacidade da primária: uma única cor evita que o olho leia
// diferença de matiz como diferença de categoria.
const LEVELS = [
  "bg-muted/50",
  "bg-primary/20",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

export function OccupancyHeatmap({ cells }: { cells: HeatmapCell[] }) {
  if (cells.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Sem horários suficientes para desenhar o mapa.
      </p>
    );
  }

  const hours = [...new Set(cells.map((cell) => cell.hour))].sort((a, b) => a - b);
  const byKey = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell]));

  return (
    // A página nunca rola na horizontal: só este container rola, então uma
    // agenda com muitas horas abertas não força o layout inteiro a esticar.
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `2.5rem repeat(${hours.length}, minmax(0, 1fr))` }}
        >
          <span />
          {hours.map((hour) => (
            <span
              key={hour}
              className="text-center text-[10px] text-muted-foreground tabular-nums"
            >
              {String(hour).padStart(2, "0")}h
            </span>
          ))}

          {WEEKDAYS.map((label, weekday) => (
            <Row key={label} label={label} weekday={weekday} hours={hours} byKey={byKey} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
          <span>Menos</span>
          {LEVELS.map((level, index) => (
            <span key={index} className={`size-3 rounded-sm ${level}`} />
          ))}
          <span>Mais</span>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  weekday,
  hours,
  byKey,
}: {
  label: string;
  weekday: number;
  hours: number[];
  byKey: Map<string, HeatmapCell>;
}) {
  return (
    <>
      <span className="flex items-center text-[11px] text-muted-foreground">
        {label}
      </span>
      {hours.map((hour) => {
        const cell = byKey.get(`${weekday}-${hour}`);
        const rate = cell && cell.total > 0 ? cell.booked / cell.total : 0;
        const level = cell ? heatIntensity(rate) : 0;

        return (
          <span
            key={hour}
            className={`h-6 rounded-sm transition-shadow duration-150 ${
              cell
                ? `${LEVELS[level]} hover:ring-1 hover:ring-inset hover:ring-foreground/30`
                : "bg-muted/20"
            }`}
            title={
              cell
                ? `${label} ${String(hour).padStart(2, "0")}h — ${cell.booked}/${cell.total} (${formatPercent(rate)})`
                : `${label} ${String(hour).padStart(2, "0")}h — sem horários`
            }
          />
        );
      })}
    </>
  );
}
