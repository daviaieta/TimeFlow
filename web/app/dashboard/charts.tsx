"use client";

import { useId, useState } from "react";

const SERIES = "#059669"; // emerald-600 — validado ≥3:1 nas superfícies clara e escura

/* ---------------------------------- Sparkline ---------------------------------- */

export function Sparkline({ points }: { points: number[] }) {
  const w = 96;
  const h = 28;
  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = points.length - 1;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24" aria-hidden>
      <path d={d} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-zinc-300 dark:stroke-zinc-700" />
      <path
        d={`M${x(last - 1).toFixed(1)},${y(points[last - 1]).toFixed(1)} L${x(last).toFixed(1)},${y(points[last]).toFixed(1)}`}
        fill="none"
        stroke={SERIES}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx={x(last)} cy={y(points[last])} r="2.5" fill={SERIES} className="stroke-white dark:stroke-zinc-900" strokeWidth="1.5" />
    </svg>
  );
}

/* ------------------------------ Card com toggle tabela ------------------------------ */

function ChartCard({
  title,
  subtitle,
  table,
  children,
}: {
  title: string;
  subtitle: string;
  table: { columns: [string, string]; rows: [string, string][] };
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {showTable ? "Gráfico" : "Tabela"}
        </button>
      </div>
      <div className="mt-4">
        {showTable ? (
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="py-1.5 font-medium">{table.columns[0]}</th>
                  <th className="py-1.5 text-right font-medium">{table.columns[1]}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {table.rows.map(([k, v]) => (
                  <tr key={k} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                    <td className="py-1.5 text-zinc-700 dark:text-zinc-300">{k}</td>
                    <td className="py-1.5 text-right font-medium">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* --------------------------- Linha: agendamentos por dia --------------------------- */

export function DailyBookingsChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId();

  const w = 660;
  const h = 220;
  const m = { top: 12, right: 12, bottom: 26, left: 34 };
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;
  const maxY = 60;
  const ticks = [0, 20, 40, 60];

  const x = (i: number) => m.left + (i / (data.length - 1)) * iw;
  const y = (v: number) => m.top + ih - (v / maxY) * ih;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(m.top + ih).toFixed(1)} L${m.left},${(m.top + ih).toFixed(1)} Z`;

  const moveTo = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * w;
    const i = Math.round(((px - m.left) / iw) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setHover((v) => Math.min(data.length - 1, (v ?? 0) + 1));
    else if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? data.length - 1) - 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const last = data.length - 1;
  const hoverPct = hover !== null ? (x(hover) / w) * 100 : 0;

  return (
    <ChartCard
      title="Agendamentos por dia"
      subtitle="Últimos 30 dias"
      table={{ columns: ["Dia", "Agendamentos"], rows: data.map((d) => [d.label, String(d.value)]) }}
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full"
          role="img"
          aria-label="Gráfico de linha de agendamentos por dia nos últimos 30 dias"
          tabIndex={0}
          onKeyDown={onKey}
          onPointerMove={(e) => moveTo(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity="0.12" />
              <stop offset="100%" stopColor={SERIES} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={w - m.right} y1={y(t)} y2={y(t)} strokeWidth="1" className="stroke-zinc-200 dark:stroke-zinc-800" />
              <text x={m.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" className="fill-zinc-400 tabular-nums dark:fill-zinc-500">
                {t}
              </text>
            </g>
          ))}

          {data.map((d, i) =>
            i % 5 === 0 || i === last ? (
              <text key={d.label} x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" className="fill-zinc-400 dark:fill-zinc-500">
                {d.label}
              </text>
            ) : null,
          )}

          <path d={area} fill={`url(#${gradId})`} />
          <path d={line} fill="none" stroke={SERIES} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* rótulo direto do último ponto */}
          <circle cx={x(last)} cy={y(data[last].value)} r="4" fill={SERIES} className="stroke-white dark:stroke-zinc-900" strokeWidth="2" />
          <text x={x(last) - 8} y={y(data[last].value) - 9} textAnchor="end" fontSize="11" fontWeight="600" className="fill-zinc-700 dark:fill-zinc-300">
            {data[last].value}
          </text>

          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + ih} strokeWidth="1" className="stroke-zinc-300 dark:stroke-zinc-700" />
              <circle cx={x(hover)} cy={y(data[hover].value)} r="4.5" fill={SERIES} className="stroke-white dark:stroke-zinc-900" strokeWidth="2" />
            </g>
          )}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-800"
            style={{ left: `clamp(3.5rem, ${hoverPct}%, calc(100% - 3.5rem))` }}
          >
            <span className="text-sm font-semibold">{data[hover].value}</span>{" "}
            <span className="text-zinc-500 dark:text-zinc-400">agendamentos · {data[hover].label}</span>
          </div>
        )}
      </div>
    </ChartCard>
  );
}

/* --------------------------- Colunas: faturamento semanal --------------------------- */

export function WeeklyRevenueChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);

  const w = 660;
  const h = 220;
  const m = { top: 12, right: 12, bottom: 26, left: 44 };
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;
  const maxY = 6000;
  const ticks = [0, 2000, 4000, 6000];

  const band = iw / data.length;
  const barW = Math.min(24, band * 0.5);
  const xc = (i: number) => m.left + band * i + band / 2;
  const y = (v: number) => m.top + ih - (v / maxY) * ih;

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
  const hoverPct = hover !== null ? (xc(hover) / w) * 100 : 0;

  // topo arredondado (4px), base reta
  const barPath = (i: number, v: number) => {
    const x0 = xc(i) - barW / 2;
    const y0 = y(v);
    const r = Math.min(4, (y(0) - y0) / 2);
    return `M${x0},${y(0)} L${x0},${y0 + r} Q${x0},${y0} ${x0 + r},${y0} L${x0 + barW - r},${y0} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} L${x0 + barW},${y(0)} Z`;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setHover((v) => Math.min(data.length - 1, (v ?? 0) + 1));
    else if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? data.length - 1) - 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  return (
    <ChartCard
      title="Faturamento por semana"
      subtitle="Últimas 8 semanas"
      table={{ columns: ["Semana", "Faturamento"], rows: data.map((d) => [d.label, fmt(d.value)]) }}
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full"
          role="img"
          aria-label="Gráfico de colunas de faturamento por semana nas últimas 8 semanas"
          tabIndex={0}
          onKeyDown={onKey}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={w - m.right} y1={y(t)} y2={y(t)} strokeWidth="1" className="stroke-zinc-200 dark:stroke-zinc-800" />
              <text x={m.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" className="fill-zinc-400 tabular-nums dark:fill-zinc-500">
                {t === 0 ? "0" : `${t / 1000} mil`}
              </text>
            </g>
          ))}

          {data.map((d, i) => (
            <g key={d.label}>
              <path d={barPath(i, d.value)} fill={SERIES} opacity={hover === null || hover === i ? 1 : 0.45} />
              <text x={xc(i)} y={h - 8} textAnchor="middle" fontSize="10" className="fill-zinc-400 dark:fill-zinc-500">
                {d.label}
              </text>
              {/* área de acerto maior que a marca: a banda inteira */}
              <rect
                x={m.left + band * i}
                y={m.top}
                width={band}
                height={ih}
                fill="transparent"
                onPointerMove={() => setHover(i)}
              />
            </g>
          ))}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-800"
            style={{ left: `clamp(4.5rem, ${hoverPct}%, calc(100% - 4.5rem))` }}
          >
            <span className="text-sm font-semibold">{fmt(data[hover].value)}</span>{" "}
            <span className="text-zinc-500 dark:text-zinc-400">· {data[hover].label}</span>
          </div>
        )}
      </div>
    </ChartCard>
  );
}
