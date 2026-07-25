import { isSlotUpcoming } from "./publicBookingRules";

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

export interface TeamRow {
  id: number;
  name: string;
  pendingInvite: boolean;
  slots: number;
  booked: number;
  rate: number;
  revenue: string;
}

export interface ServiceRankRow {
  id: number;
  name: string;
  bookings: number;
  revenue: string;
  share: number;
}

// Colaborador sem nenhum horário na janela cai para o fim: ocupação 0 de 0
// não é desempenho ruim, é agenda fechada — outra conversa com o dono.
export function rankTeam(slots: SlotRow[], employees: EmployeeRow[]): TeamRow[] {
  const rows = employees.map<TeamRow>((employee) => {
    const own = slots.filter((slot) => slot.employeeId === employee.id);
    const booked = own.filter((slot) => slot.isBooked);
    const revenueCents = booked.reduce(
      (sum, slot) => sum + (slot.booking ? toCents(slot.booking.service.price) : 0),
      0,
    );

    return {
      id: employee.id,
      name: employee.name,
      pendingInvite: employee.pendingInvite,
      slots: own.length,
      booked: booked.length,
      rate: own.length === 0 ? 0 : booked.length / own.length,
      revenue: formatCents(revenueCents),
    };
  });

  return rows.sort((a, b) => {
    const aEmpty = a.slots === 0 ? 1 : 0;
    const bEmpty = b.slots === 0 ? 1 : 0;

    return (
      aEmpty - bEmpty ||
      b.rate - a.rate ||
      b.booked - a.booked ||
      a.name.localeCompare(b.name, "pt-BR")
    );
  });
}

export function rankServices(slots: SlotRow[]): ServiceRankRow[] {
  const totals = new Map<number, { name: string; bookings: number; cents: number }>();

  for (const slot of slots) {
    if (!slot.booking) continue;

    const { id, name, price } = slot.booking.service;
    const entry = totals.get(id) ?? { name, bookings: 0, cents: 0 };
    entry.bookings += 1;
    entry.cents += toCents(price);
    totals.set(id, entry);
  }

  const totalCents = [...totals.values()].reduce((sum, e) => sum + e.cents, 0);

  return [...totals.entries()]
    .map<ServiceRankRow>(([id, entry]) => ({
      id,
      name: entry.name,
      bookings: entry.bookings,
      revenue: formatCents(entry.cents),
      share: totalCents === 0 ? 0 : entry.cents / totalCents,
    }))
    .sort(
      (a, b) =>
        b.share - a.share ||
        b.bookings - a.bookings ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
}

// Linha da query dedicada de próximos reservados. Formato diferente de
// SlotRow porque aqui interessa o nome do profissional, não o id.
export interface UpcomingSlotRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  clientName: string | null;
  employee: { name: string };
  booking: {
    clientName: string;
    clientPhone: string;
    service: { name: string };
  } | null;
}

export interface UpcomingRow {
  availabilityId: number;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientPhone: string | null;
  serviceName: string | null;
  employeeName: string;
}

export type AlertKind =
  | "employee-no-slots"
  | "service-no-employee"
  | "day-fully-booked"
  | "pending-invite";

export interface DashboardAlert {
  kind: AlertKind;
  label: string;
  count: number;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function buildUpcoming(
  rows: UpcomingSlotRow[],
  now: Date,
  limit: number,
): UpcomingRow[] {
  return rows
    .filter((row) => isSlotUpcoming(row, now))
    .sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        a.startTime.localeCompare(b.startTime),
    )
    .slice(0, limit)
    .map((row) => ({
      availabilityId: row.id,
      date: row.date.toISOString().slice(0, 10),
      startTime: row.startTime,
      endTime: row.endTime,
      // Booking manda no nome: é o cliente que de fato reservou.
      clientName: row.booking?.clientName ?? row.clientName ?? "Cliente",
      clientPhone: row.booking?.clientPhone ?? null,
      serviceName: row.booking?.service.name ?? null,
      employeeName: row.employee.name,
    }));
}

// Alertas são texto pronto: quem monta a frase é quem conhece a regra, não a UI.
export function buildAlerts(
  slots: SlotRow[],
  employees: EmployeeRow[],
  services: CatalogServiceRow[],
  days: number,
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  const withSlots = new Set(slots.map((slot) => slot.employeeId));
  const idle = employees.filter(
    // Convite pendente já tem alerta próprio — não cobrar agenda de quem
    // ainda nem entrou.
    (employee) => !employee.pendingInvite && !withSlots.has(employee.id),
  ).length;

  if (idle > 0) {
    alerts.push({
      kind: "employee-no-slots",
      count: idle,
      label:
        `${idle} ${plural(idle, "colaborador", "colaboradores")} sem horários ` +
        `abertos nos próximos ${days} dias`,
    });
  }

  const linked = new Set(employees.flatMap((employee) => employee.serviceIds));
  const orphan = services.filter((service) => !linked.has(service.id)).length;

  if (orphan > 0) {
    alerts.push({
      kind: "service-no-employee",
      count: orphan,
      label: `${orphan} ${plural(orphan, "serviço", "serviços")} sem profissional vinculado`,
    });
  }

  const perDay = new Map<string, { total: number; free: number }>();
  for (const slot of slots) {
    const key = slot.date.toISOString().slice(0, 10);
    const entry = perDay.get(key) ?? { total: 0, free: 0 };
    entry.total += 1;
    if (!slot.isBooked) entry.free += 1;
    perDay.set(key, entry);
  }

  const fullDays = [...perDay.values()].filter(
    (entry) => entry.total > 0 && entry.free === 0,
  ).length;

  if (fullDays > 0) {
    alerts.push({
      kind: "day-fully-booked",
      count: fullDays,
      label: `${fullDays} ${plural(fullDays, "dia", "dias")} sem nenhum horário livre`,
    });
  }

  const pending = employees.filter((employee) => employee.pendingInvite).length;
  if (pending > 0) {
    alerts.push({
      kind: "pending-invite",
      count: pending,
      label: `${pending} ${plural(pending, "convite pendente", "convites pendentes")}`,
    });
  }

  return alerts;
}
