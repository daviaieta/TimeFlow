"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMinutes } from "@/lib/schedule";
import type { TimelineEvent } from "@/lib/timeline";
import { cn } from "@/lib/utils";

interface EventDetailsDialogProps {
  event: TimelineEvent;
  dateLabel: string;
  onClose: () => void;
}

export function EventDetailsDialog({ event, dateLabel, onClose }: EventDetailsDialogProps) {
  const { profile } = event.booking;
  // O título é o nome do ato; o prontuário pode ter sido corrigido depois. Só
  // mostramos o nome do cadastro quando ele diverge — repetir o mesmo nome duas
  // vezes na mesma caixa não informa nada.
  const renamed = profile !== null && profile.displayName !== event.booking.clientName;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.booking.clientName}</DialogTitle>
          <DialogDescription className="capitalize">{dateLabel}</DialogDescription>
        </DialogHeader>

        {/* O link mora aqui e não na linha da timeline: o evento da agenda já é
            um botão, e um link dentro de um botão é HTML inválido além de
            roubar o alvo de toque de quem só queria abrir a reserva. */}
        {profile && (
          <Link
            href={`/dashboard/clientes/${profile.publicId}`}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "w-fit max-w-full",
            )}
          >
            <HugeiconsIcon icon={UserGroupIcon} data-icon="inline-start" />
            <span className="truncate">
              {renamed ? `Prontuário de ${profile.displayName}` : "Ver prontuário"}
            </span>
          </Link>
        )}

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
