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

export interface OccupancyBucket {
  key: string;
  label: string;
  booked: number;
  free: number;
}

export interface HeatmapCell {
  weekday: number;
  hour: number;
  booked: number;
  total: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Rótulos fixos em vez de Intl: o teste não pode depender do ICU da máquina.
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function dayLabel(date: Date): string {
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()}`;
}

function weekLabel(start: Date, end: Date): string {
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
  }

  return (
    `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}` +
    `–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`
  );
}

// Buckets são montados a partir de `from`, não dos slots: um dia sem nenhum
// horário precisa aparecer zerado, senão o eixo some com o tempo parado.
export function bucketOccupancy(
  slots: SlotRow[],
  days: number,
  from: Date,
): OccupancyBucket[] {
  const daily = days === 7;
  const span = daily ? 1 : 7;
  const count = daily ? 7 : Math.ceil(days / 7);

  const buckets: OccupancyBucket[] = [];
  const index = new Map<string, OccupancyBucket>();

  for (let i = 0; i < count; i += 1) {
    const start = addDays(from, i * span);
    const end = addDays(start, span - 1);
    const bucket: OccupancyBucket = {
      key: dayKey(start),
      label: daily ? dayLabel(start) : weekLabel(start, end),
      booked: 0,
      free: 0,
    };

    buckets.push(bucket);

    for (let offset = 0; offset < span; offset += 1) {
      index.set(dayKey(addDays(start, offset)), bucket);
    }
  }

  for (const slot of slots) {
    const bucket = index.get(dayKey(slot.date));
    if (!bucket) continue; // slot fora da janela — defensivo

    if (slot.isBooked) bucket.booked += 1;
    else bucket.free += 1;
  }

  return buckets;
}

export function buildHeatmap(slots: SlotRow[]): HeatmapCell[] {
  const cells = new Map<string, HeatmapCell>();

  for (const slot of slots) {
    const weekday = slot.date.getUTCDay();
    const hour = Number(slot.startTime.slice(0, 2));
    const key = `${weekday}-${hour}`;

    const cell = cells.get(key) ?? { weekday, hour, booked: 0, total: 0 };
    cell.total += 1;
    if (slot.isBooked) cell.booked += 1;
    cells.set(key, cell);
  }

  return [...cells.values()].sort(
    (a, b) => a.weekday - b.weekday || a.hour - b.hour,
  );
}
