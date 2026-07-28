"use client";

import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMinutes } from "@/lib/schedule";
import type { TimelineEvent } from "@/lib/timeline";

interface EventDetailsDialogProps {
  event: TimelineEvent;
  dateLabel: string;
  onClose: () => void;
}

export function EventDetailsDialog({ event, dateLabel, onClose }: EventDetailsDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.booking.clientName}</DialogTitle>
          <DialogDescription className="capitalize">{dateLabel}</DialogDescription>
        </DialogHeader>

        <dl className="grid text-sm">
          <Row label="Serviço" value={event.booking.service.name} />
          <Row
            label="Horário"
            value={`${event.startTime} – ${event.endTime} · ${formatMinutes(
              event.durationMinutes,
            )}`}
          />
          <Row
            label="Telefone"
            value={
              <a
                className="text-primary hover:underline"
                href={`tel:${event.booking.clientPhone}`}
              >
                {event.booking.clientPhone}
              </a>
            }
          />
          {event.booking.clientEmail && (
            <Row
              label="Email"
              value={
                <a
                  className="text-primary hover:underline"
                  href={`mailto:${event.booking.clientEmail}`}
                >
                  {event.booking.clientEmail}
                </a>
              }
            />
          )}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 last:border-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}
