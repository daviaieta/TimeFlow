// price chega como Prisma Decimal em produção e como string nos testes —
// ambos respondem a toString(). Mesmo contrato de publicBookingRules.
export interface PriceLike {
  toString(): string;
}

// Uma Availability da janela, já com o booking (quando existe) resolvido.
// booking null + isBooked true = encaixe manual do colaborador.
export interface SlotRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
  employeeId: number;
  booking: {
    clientName: string;
    clientPhone: string;
    service: { id: number; name: string; price: PriceLike };
  } | null;
}

export interface EmployeeRow {
  id: number;
  name: string;
  pendingInvite: boolean;
  serviceIds: number[];
}

export interface CatalogServiceRow {
  id: number;
  name: string;
}

export interface DashboardKpis {
  occupancy: { rate: number; booked: number; total: number };
  bookings: { total: number; online: number; manual: number };
  revenue: { scheduled: string; averageTicket: string };
  pace: { current: number; previous: number };
}

// Dinheiro circula em centavos inteiros: somar Decimal como float acumula
// erro já na terceira reserva.
export function toCents(price: PriceLike): number {
  return Math.round(Number(price.toString()) * 100);
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function buildKpis(
  slots: SlotRow[],
  pace: { current: number; previous: number },
): DashboardKpis {
  const total = slots.length;
  const bookedSlots = slots.filter((slot) => slot.isBooked);
  const online = bookedSlots.filter((slot) => slot.booking !== null);

  const revenueCents = online.reduce(
    (sum, slot) => sum + toCents(slot.booking!.service.price),
    0,
  );

  return {
    occupancy: {
      rate: total === 0 ? 0 : bookedSlots.length / total,
      booked: bookedSlots.length,
      total,
    },
    bookings: {
      total: bookedSlots.length,
      online: online.length,
      manual: bookedSlots.length - online.length,
    },
    revenue: {
      scheduled: formatCents(revenueCents),
      averageTicket:
        online.length === 0
          ? "0.00"
          : formatCents(Math.round(revenueCents / online.length)),
    },
    pace,
  };
}
