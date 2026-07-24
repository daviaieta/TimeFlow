// Tipos espelhando a API pública (/public/businesses/:slug).
export interface NextSlot {
  date: string;
  startTime: string;
}

export interface PublicEmployee {
  id: number;
  name: string;
  nextSlot: NextSlot | null;
}

export interface PublicService {
  id: number;
  name: string;
  duration: number;
  price: string;
  employees: PublicEmployee[];
}

export interface PublicBusiness {
  business: { name: string; slug: string };
  professionals: PublicEmployee[];
  services: PublicService[];
}

export interface PublicSlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
}

export interface BookingSummary {
  business: string;
  service: string;
  duration: number;
  price: string;
  employee: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function groupSlotsByDay(slots: PublicSlot[]): [string, PublicSlot[]][] {
  const groups = new Map<string, PublicSlot[]>();

  for (const slot of slots) {
    const key = slot.date.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(slot);
    groups.set(key, list);
  }

  return [...groups.entries()];
}

// Manual em vez de toLocaleDateString para o resultado ser determinístico
// nos testes, independente do ICU do ambiente.
export function dayChipLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return "Hoje";

  const date = new Date(`${dayKey}T00:00:00`);
  const weekday = WEEKDAYS[date.getDay()];
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS[date.getMonth()];
  return `${weekday}, ${day} ${month}`;
}

export function nextSlotLabel(slot: NextSlot, todayKey: string): string {
  return `${dayChipLabel(slot.date.slice(0, 10), todayKey)} ${slot.startTime}`;
}

// Menor próximo horário entre vários profissionais (ex.: os de um serviço).
export function earliestNextSlot(employees: PublicEmployee[]): NextSlot | null {
  let earliest: NextSlot | null = null;

  for (const employee of employees) {
    const slot = employee.nextSlot;
    if (!slot) continue;

    const isEarlier =
      earliest === null ||
      slot.date < earliest.date ||
      (slot.date === earliest.date && slot.startTime < earliest.startTime);

    if (isEarlier) earliest = slot;
  }

  return earliest;
}

export function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, "").length >= 8;
}

export function formatPrice(price: string): string {
  const value = Number(price);
  const cents = Math.round(value * 100);
  const reais = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `R$ ${reais},${rest}`;
}
