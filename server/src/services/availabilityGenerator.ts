import { toMinutes, toTime } from "../lib/time";
import { isSlotUpcoming } from "./bookingRules";

export interface WorkWindow {
  workStart: string;
  workEnd: string;
  breakStart?: string;
  breakEnd?: string;
}

export interface PlannedSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface ExistingSlot {
  date: Date;
  startTime: string;
  endTime: string;
}

// Um slot só entra se couber inteiro: antes do almoço, depois dele, e
// terminando dentro do expediente.
export function sliceWorkday(
  window: WorkWindow,
  slotMinutes: number,
): { startTime: string; endTime: string }[] {
  const workEnd = toMinutes(window.workEnd);
  const breakStart = window.breakStart ? toMinutes(window.breakStart) : null;
  const breakEnd = window.breakEnd ? toMinutes(window.breakEnd) : null;

  const slots: { startTime: string; endTime: string }[] = [];
  let cursor = toMinutes(window.workStart);

  while (cursor + slotMinutes <= workEnd) {
    const end = cursor + slotMinutes;

    if (breakStart !== null && breakEnd !== null && end > breakStart && cursor < breakEnd) {
      // cruzou o almoço — retoma no fim da pausa
      cursor = breakEnd;
      continue;
    }

    slots.push({ startTime: toTime(cursor), endTime: toTime(end) });
    cursor = end;
  }

  return slots;
}

// Dia da semana pela data UTC — datas de Availability são meia-noite UTC.
export function enumerateDays(
  startDate: string,
  endDate: string,
  weekdays: number[],
): string[] {
  const wanted = new Set(weekdays);
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    if (wanted.has(cursor.getUTCDay())) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function planAvailabilities(input: {
  startDate: string;
  endDate: string;
  weekdays: number[];
  window: WorkWindow;
  slotMinutes: number;
  existing: ExistingSlot[];
  now: Date;
}): { kept: PlannedSlot[]; skippedOverlap: number } {
  const daySlots = sliceWorkday(input.window, input.slotMinutes);
  const days = enumerateDays(input.startDate, input.endDate, input.weekdays);

  const existingByDay = new Map<string, ExistingSlot[]>();
  for (const slot of input.existing) {
    const key = slot.date.toISOString().slice(0, 10);
    const list = existingByDay.get(key) ?? [];
    list.push(slot);
    existingByDay.set(key, list);
  }

  const kept: PlannedSlot[] = [];
  let skippedOverlap = 0;

  for (const day of days) {
    const busy = existingByDay.get(day) ?? [];

    for (const slot of daySlots) {
      const upcoming = isSlotUpcoming(
        { date: new Date(`${day}T00:00:00.000Z`), startTime: slot.startTime },
        input.now,
      );
      if (!upcoming) {
        continue; // passado não conta nem como skipped — nunca deveria existir
      }

      const clash = busy.some((b) =>
        overlaps(
          toMinutes(slot.startTime),
          toMinutes(slot.endTime),
          toMinutes(b.startTime),
          toMinutes(b.endTime),
        ),
      );

      if (clash) {
        skippedOverlap += 1;
      } else {
        kept.push({ date: day, ...slot });
      }
    }
  }

  return { kept, skippedOverlap };
}
