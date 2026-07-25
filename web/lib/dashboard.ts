export type PeriodDays = 7 | 30 | 90;

export interface DashboardKpis {
  occupancy: { rate: number; booked: number; total: number };
  bookings: { total: number; online: number; manual: number };
  revenue: { scheduled: string; averageTicket: string };
  pace: { current: number; previous: number };
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

export interface UpcomingBooking {
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

export interface DashboardOverview {
  range: { days: number; from: string; to: string };
  kpis: DashboardKpis;
  occupancyByBucket: OccupancyBucket[];
  heatmap: HeatmapCell[];
  team: TeamRow[];
  services: ServiceRankRow[];
  upcoming: UpcomingBooking[];
  alerts: DashboardAlert[];
}

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function formatCurrency(value: string): string {
  return currency.format(Number(value));
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// 0 é um degrau próprio: célula sem nenhuma reserva precisa ler como vazia,
// não como "pouco ocupada".
export function heatIntensity(rate: number): number {
  if (rate <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil(rate * 4)));
}

function nextDayKey(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function relativeDayLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return "Hoje";
  if (dayKey === nextDayKey(todayKey)) return "Amanhã";

  const date = new Date(`${dayKey}T00:00:00.000Z`);
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]}, ${day} ${MONTHS[date.getUTCMonth()]}`;
}

export function groupUpcomingByDay(
  rows: UpcomingBooking[],
): [string, UpcomingBooking[]][] {
  const groups = new Map<string, UpcomingBooking[]>();

  for (const row of rows) {
    const list = groups.get(row.date) ?? [];
    list.push(row);
    groups.set(row.date, list);
  }

  return [...groups.entries()];
}

export function paceDelta(
  current: number,
  previous: number,
): { direction: "up" | "down" | "flat"; percent: number | null } {
  if (previous === 0) {
    return { direction: current > 0 ? "up" : "flat", percent: null };
  }

  const percent = (current - previous) / previous;
  if (percent === 0) return { direction: "flat", percent: 0 };

  return { direction: percent > 0 ? "up" : "down", percent };
}
