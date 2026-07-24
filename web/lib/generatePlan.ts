// Espelho leve da lógica de server/src/services/availabilityGenerator.ts,
// só para a estimativa ao vivo no dialog. O servidor continua sendo a fonte
// da verdade — ele também desconta sobreposições e slots já passados, então
// o número real pode vir menor.

export interface GeneratePlanInput {
  startDate: string;
  endDate: string;
  weekdays: number[];
  workStart: string;
  workEnd: string;
  breakStart?: string;
  breakEnd?: string;
  slotMinutes: number;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function slotsPerDay(input: GeneratePlanInput): number {
  const workStart = toMinutes(input.workStart);
  const workEnd = toMinutes(input.workEnd);
  const breakStart = input.breakStart ? toMinutes(input.breakStart) : null;
  const breakEnd = input.breakEnd ? toMinutes(input.breakEnd) : null;

  let count = 0;
  let cursor = workStart;

  while (cursor + input.slotMinutes <= workEnd) {
    const end = cursor + input.slotMinutes;

    if (breakStart !== null && breakEnd !== null && end > breakStart && cursor < breakEnd) {
      cursor = breakEnd;
      continue;
    }

    count += 1;
    cursor = end;
  }

  return count;
}

function countDays(startDate: string, endDate: string, weekdays: number[]): number {
  const wanted = new Set(weekdays);
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return 0;

  let days = 0;
  while (cursor.getTime() <= end.getTime()) {
    if (wanted.has(cursor.getUTCDay())) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export function estimateGeneratedSlots(input: GeneratePlanInput): number {
  if (input.weekdays.length === 0) return 0;
  if (input.endDate < input.startDate) return 0;
  if (input.workEnd <= input.workStart) return 0;

  return countDays(input.startDate, input.endDate, input.weekdays) * slotsPerDay(input);
}
