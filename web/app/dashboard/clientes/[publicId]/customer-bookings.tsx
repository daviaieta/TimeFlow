"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/dashboard/panel";
import { formatBookingWhen } from "@/lib/crm";
import { formatCurrency } from "@/lib/dashboard";
import { CustomerBooking } from "@/lib/types";

const PAGE_SIZE = 10;

// Histórico de reservas do prontuário, mais recente primeiro. Paginação por
// cursor: a lista de um cliente antigo pode ser longa, e OFFSET numa tabela de
// reservas é a consulta mais lenta do produto.

export function CustomerBookings({ publicId }: { publicId: string }) {
  const [bookings, setBookings] = useState<CustomerBooking[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(() => {
    return fetchAdapter<{ bookings: CustomerBooking[]; nextCursor: string | null }>({
      method: "GET",
      path: `/customers/${publicId}/bookings?limit=${PAGE_SIZE}`,
    })
      .then(({ data }) => {
        setBookings(data.bookings);
        setNextCursor(data.nextCursor);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, [publicId]);

  useEffect(() => {
    load();
  }, [load]);

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);

    fetchAdapter<{ bookings: CustomerBooking[]; nextCursor: string | null }>({
      method: "GET",
      path: `/customers/${publicId}/bookings?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
    })
      .then(({ data }) => {
        setBookings((current) => [...(current ?? []), ...data.bookings]);
        setNextCursor(data.nextCursor);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      })
      .finally(() => setLoadingMore(false));
  }

  return (
    <Panel title="Histórico" description="Reservas deste cliente aqui.">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {bookings === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma reserva ainda. Cliente cadastrado no balcão começa assim.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {bookings.map((booking) => (
            <li key={booking.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {booking.serviceName ?? "Serviço removido"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatBookingWhen(booking)}
                  {booking.employeeName ? ` · ${booking.employeeName}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm tabular-nums">
                {booking.priceAtBooking ? formatCurrency(booking.priceAtBooking) : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="ghost" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Carregando…" : "Ver mais reservas"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
