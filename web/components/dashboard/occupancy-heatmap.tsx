"use client";

import { useState } from "react";
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

function describe(
  weekday: number,
  hour: number,
  cell: HeatmapCell | undefined,
): string {
  const when = `${WEEKDAYS[weekday]} ${String(hour).padStart(2, "0")}h`;
  if (!cell) return `${when} — sem horários`;

  const rate = cell.total > 0 ? cell.booked / cell.total : 0;
  return `${when} — ${cell.booked}/${cell.total} (${formatPercent(rate)})`;
}

// No desktop o `title` já entrega o detalhe no hover. No celular não existe
// hover: sem o toque abaixo, o mapa viraria só forma, sem número nenhum.
function Cell({
  weekday,
  hour,
  byKey,
  onSelect,
}: {
  weekday: number;
  hour: number;
  byKey: Map<string, HeatmapCell>;
  onSelect: (label: string) => void;
}) {
  const cell = byKey.get(`${weekday}-${hour}`);
  const rate = cell && cell.total > 0 ? cell.booked / cell.total : 0;
  const level = cell ? heatIntensity(rate) : 0;
  const label = describe(weekday, hour, cell);

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => onSelect(label)}
      className={`h-6 rounded-sm transition-shadow duration-150 ${
        cell
          ? `${LEVELS[level]} hover:ring-1 hover:ring-inset hover:ring-foreground/30`
          : "bg-muted/20"
      }`}
    />
  );
}

function AxisLabel({ children }: { children: string }) {
  return (
    <span className="flex items-center justify-center text-[10px] text-muted-foreground tabular-nums">
      {children}
    </span>
  );
}

export function OccupancyHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const [selected, setSelected] = useState<string | null>(null);

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
    <div>
      {/* Abaixo de sm o mapa é transposto: hora nas linhas, dia da semana nas
          colunas. Sete colunas cabem na largura de um celular, então o mapa
          inteiro fica visível e a leitura acompanha o scroll vertical da
          página — em vez de um scroll horizontal dentro de um painel, que é o
          gesto que ninguém descobre. Acima de sm o número de horas passa de
          sete e a orientação se inverte. */}
      <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] gap-1 sm:hidden">
        <span />
        {WEEKDAYS.map((label) => (
          <AxisLabel key={label}>{label}</AxisLabel>
        ))}

        {hours.map((hour) => (
          <Row
            key={hour}
            label={`${String(hour).padStart(2, "0")}h`}
            cells={WEEKDAYS.map((_, weekday) => (
              <Cell
                key={weekday}
                weekday={weekday}
                hour={hour}
                byKey={byKey}
                onSelect={setSelected}
              />
            ))}
          />
        ))}
      </div>

      <div className="hidden sm:block">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `2.5rem repeat(${hours.length}, minmax(0, 1fr))`,
          }}
        >
          <span />
          {hours.map((hour) => (
            <AxisLabel key={hour}>{`${String(hour).padStart(2, "0")}h`}</AxisLabel>
          ))}

          {WEEKDAYS.map((label, weekday) => (
            <Row
              key={label}
              label={label}
              cells={hours.map((hour) => (
                <Cell
                  key={hour}
                  weekday={weekday}
                  hour={hour}
                  byKey={byKey}
                  onSelect={setSelected}
                />
              ))}
            />
          ))}
        </div>
      </div>

      {/* Altura reservada mesmo vazio: a legenda abaixo não pode saltar de
          lugar no primeiro toque. */}
      <p
        aria-live="polite"
        className="mt-3 h-4 text-center text-xs font-medium tabular-nums sm:text-left"
      >
        {selected}
      </p>

      <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <span>Menos</span>
        {LEVELS.map((level, index) => (
          <span key={index} className={`size-3 rounded-sm ${level}`} />
        ))}
        <span>Mais</span>
      </div>
    </div>
  );
}

function Row({ label, cells }: { label: string; cells: React.ReactNode }) {
  return (
    <>
      <span className="flex items-center text-[11px] text-muted-foreground tabular-nums">
        {label}
      </span>
      {cells}
    </>
  );
}
