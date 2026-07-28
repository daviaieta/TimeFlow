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

// Navegação da agenda: um dia por tela, então "anterior/próximo" é sempre
// ±1 dia sobre a chave local — nunca sobre um Date em UTC, que erraria o dia
// perto da meia-noite.
export function shiftDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return localDayKey(new Date(year, month - 1, day + days));
}
