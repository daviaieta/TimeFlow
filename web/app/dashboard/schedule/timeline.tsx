"use client";

import { RefObject } from "react";
import type { TimelineItem } from "@/lib/timeline";
import { formatMinutes } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { TimelineEventRow } from "./timeline-event";
import { TimelineSlotRow } from "./timeline-slot";

// A régua fica exatamente na borda da coluna de horas. Todo elemento que
// precisa tocá-la (barra do evento, ponto do "agora") se posiciona por aqui,
// então largura de coluna e posição da linha nunca saem de sincronia.
export const RAIL = "grid grid-cols-[52px_1fr] sm:grid-cols-[68px_1fr]";
export const RAIL_LINE = "left-[52px] sm:left-[68px]";
export const TIME_CELL =
  "pr-3 text-right text-[11px] font-medium tabular-nums text-muted-foreground sm:pr-4 sm:text-xs";

interface TimelineProps {
  items: TimelineItem[];
  selectedSlotId: number | null;
  canManage: boolean;
  nowRef: RefObject<HTMLDivElement | null>;
  onSelectSlot: (id: number | null) => void;
  onBook: (item: Extract<TimelineItem, { kind: "free" }>) => void;
  onEdit: (item: Extract<TimelineItem, { kind: "free" }>) => void;
  onDelete: (item: Extract<TimelineItem, { kind: "free" }>) => void;
  onOpenEvent: (item: Extract<TimelineItem, { kind: "event" }>) => void;
}

export function Timeline({
  items,
  selectedSlotId,
  canManage,
  nowRef,
  onSelectSlot,
  onBook,
  onEdit,
  onDelete,
  onOpenEvent,
}: TimelineProps) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 w-px bg-border ${RAIL_LINE}`}
      />

      {items.map((item) => {
        if (item.kind === "now") {
          return <NowMarker key={item.key} ref={nowRef} time={item.time} />;
        }

        if (item.kind === "gap") {
          return (
            <div key={item.key} className={RAIL}>
              <div aria-hidden />
              <div className="relative py-2.5 pl-4">
                <span
                  aria-hidden
                  className="absolute inset-y-0 -left-px w-px border-l border-dashed border-border bg-background"
                />
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground/60 uppercase">
                  Intervalo · {formatMinutes(item.minutes)}
                </span>
              </div>
            </div>
          );
        }

        if (item.kind === "event") {
          return (
            <TimelineEventRow key={item.key} item={item} onOpen={() => onOpenEvent(item)} />
          );
        }

        return (
          <TimelineSlotRow
            key={item.key}
            item={item}
            canManage={canManage}
            selected={selectedSlotId === item.slot.id}
            onSelect={() =>
              onSelectSlot(selectedSlotId === item.slot.id ? null : item.slot.id)
            }
            onBook={() => onBook(item)}
            onEdit={() => onEdit(item)}
            onDelete={() => onDelete(item)}
          />
        );
      })}
    </div>
  );
}

function NowMarker({ time, ref }: { time: string; ref: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={ref} className={`${RAIL} scroll-mt-32 py-1.5`} aria-label={`Agora, ${time}`}>
      {/* cn resolve o conflito com o text-muted-foreground de TIME_CELL —
          concatenar string deixaria a ordem do CSS decidir a cor. */}
      <div className={cn(TIME_CELL, "font-semibold text-primary")}>{time}</div>
      <div className="relative flex items-center">
        <span className="absolute -left-[3.5px] size-[7px] rounded-full bg-primary ring-4 ring-background" />
        <span className="h-px w-full bg-gradient-to-r from-primary/60 to-primary/0" />
      </div>
    </div>
  );
}
