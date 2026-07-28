"use client";

import type { TimelineEvent } from "@/lib/timeline";
import { formatMinutes } from "@/lib/schedule";
import { RAIL, RAIL_LINE, TIME_CELL } from "./timeline";

interface TimelineEventRowProps {
  item: TimelineEvent;
  onOpen: () => void;
}

// O evento não é um card: é a própria régua engrossando. A barra sólida cobre
// a linha fina no mesmo x, então a agenda continua sendo uma coluna só.
export function TimelineEventRow({ item, onOpen }: TimelineEventRowProps) {
  return (
    <div className={`${RAIL} relative`} data-past={item.past || undefined}>
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-1 -ml-px w-[3px] rounded-full bg-primary transition-opacity ${RAIL_LINE} ${
          item.past ? "opacity-40" : ""
        }`}
      />
      <div className={`${TIME_CELL} pt-3.5`}>{item.startTime}</div>
      <button
        type="button"
        onClick={onOpen}
        className={`my-0.5 ml-px w-full rounded-r-lg rounded-l-sm bg-primary/6 px-4 py-3 text-left transition-colors hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
          item.past ? "opacity-55 hover:opacity-100" : ""
        }`}
      >
        <p className="truncate text-sm font-semibold">{item.booking.clientName}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.booking.service.name}
        </p>
        <p className="mt-1.5 text-xs tabular-nums text-muted-foreground/80">
          {item.startTime} – {item.endTime} · {formatMinutes(item.durationMinutes)}
        </p>
      </button>
    </div>
  );
}
