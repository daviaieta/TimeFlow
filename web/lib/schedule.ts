import type { Availability } from "./types";

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

export function formatDuration(startTime: string, endTime: string): string {
  return formatMinutes(toMinutes(endTime) - toMinutes(startTime));
}

export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function groupByDate(items: Availability[]): [string, Availability[]][] {
  const groups = new Map<string, Availability[]>();

  for (const item of items) {
    const key = item.date.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.entries()];
}

// upcoming: os dias já chegam do servidor na ordem certa (mais próximo primeiro).
// past: o servidor devolve os horários sempre crescentes por dia; só a ORDEM DOS
// DIAS precisa inverter aqui (mais recente primeiro), nunca os horários dentro
// de um dia.
export function orderDayGroups(
  groups: [string, Availability[]][],
  tab: "upcoming" | "past",
): [string, Availability[]][] {
  return tab === "past" ? [...groups].reverse() : groups;
}

export function summarizeDay(slots: Availability[]): {
  busy: number;
  free: number;
  label: string;
} {
  const busy = slots.filter((slot) => slot.isBooked).length;
  const free = slots.length - busy;
  const minutes = slots.reduce(
    (total, slot) => total + toMinutes(slot.endTime) - toMinutes(slot.startTime),
    0,
  );

  const label = [
    `${busy} ${busy === 1 ? "ocupado" : "ocupados"}`,
    `${free} ${free === 1 ? "livre" : "livres"}`,
    formatMinutes(minutes),
  ].join(" · ");

  return { busy, free, label };
}
