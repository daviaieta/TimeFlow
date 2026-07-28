import type { Availability, BookingSummary } from "./types";
import { formatMinutes, localDayKey, toMinutes } from "./schedule.ts";

export interface TimelineEvent {
  kind: "event";
  key: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  booking: BookingSummary;
  // Todos os slots que a reserva ocupa — o evento é um bloco só na tela, mas
  // continua sendo N linhas no banco.
  slotIds: number[];
  past: boolean;
}

export interface TimelineFree {
  kind: "free";
  key: string;
  startTime: string;
  endTime: string;
  slot: Availability;
  past: boolean;
}

export interface TimelineGap {
  kind: "gap";
  key: string;
  startTime: string;
  endTime: string;
  minutes: number;
}

export interface TimelineNow {
  kind: "now";
  key: string;
  time: string;
}

export type TimelineItem = TimelineEvent | TimelineFree | TimelineGap | TimelineNow;

function clockTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Um slot só vira evento se a reserva veio junto: sem nome e serviço não há o
// que desenhar, e um evento em branco confunde mais do que um horário livre.
function bookingOf(slot: Availability): BookingSummary | null {
  return slot.isBooked ? slot.booking : null;
}

// Fatia a lista em blocos: slots seguidos da MESMA reserva ficam juntos, cada
// slot livre fica sozinho.
function groupBySameBooking(slots: Availability[]): Availability[][] {
  const runs: Availability[][] = [];

  for (const slot of slots) {
    const current = runs[runs.length - 1];
    const currentBookingId = current ? (bookingOf(current[0])?.id ?? null) : null;
    const bookingId = bookingOf(slot)?.id ?? null;

    if (current && bookingId !== null && bookingId === currentBookingId) {
      current.push(slot);
    } else {
      runs.push([slot]);
    }
  }

  return runs;
}

/**
 * Transforma os horários de UM dia na sequência que a timeline desenha:
 * eventos, horários livres, intervalos entre um e outro e — só quando o dia
 * exibido é hoje — o marcador do horário atual.
 *
 * `dayKey` é "YYYY-MM-DD" no fuso local; `now` é o relógio do usuário.
 */
export function buildTimeline(
  slots: Availability[],
  dayKey: string,
  now: Date,
): TimelineItem[] {
  const todayKey = localDayKey(now);
  const nowTime = clockTime(now);
  const isToday = dayKey === todayKey;
  const dayIsOver = dayKey < todayKey;

  // Um horário só é passado quando já TERMINOU: enquanto o corte está
  // acontecendo, o evento continua ativo na tela.
  function isPast(endTime: string): boolean {
    if (dayIsOver) return true;
    if (!isToday) return false;
    return endTime <= nowTime;
  }

  const ordered = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const items: TimelineItem[] = [];
  let previousEnd: string | null = null;

  for (const run of groupBySameBooking(ordered)) {
    const startTime = run[0].startTime;
    const endTime = run[run.length - 1].endTime;

    if (previousEnd !== null && previousEnd < startTime) {
      items.push({
        kind: "gap",
        key: `gap-${previousEnd}-${startTime}`,
        startTime: previousEnd,
        endTime: startTime,
        minutes: toMinutes(startTime) - toMinutes(previousEnd),
      });
    }

    const booking = bookingOf(run[0]);
    if (booking) {
      items.push({
        kind: "event",
        key: `event-${booking.id}-${startTime}`,
        startTime,
        endTime,
        durationMinutes: toMinutes(endTime) - toMinutes(startTime),
        booking,
        slotIds: run.map((slot) => slot.id),
        past: isPast(endTime),
      });
    } else {
      items.push({
        kind: "free",
        key: `free-${run[0].id}`,
        startTime,
        endTime,
        slot: run[0],
        past: isPast(endTime),
      });
    }

    previousEnd = endTime;
  }

  if (!isToday) return items;

  // O marcador entra antes do primeiro item que ainda vai COMEÇAR. Assim ele
  // nunca corta um evento em andamento ao meio — aparece logo depois dele.
  const marker: TimelineNow = { kind: "now", key: "now", time: nowTime };
  const index = items.findIndex((item) => item.kind !== "now" && item.startTime > nowTime);

  if (index === -1) {
    items.push(marker);
  } else {
    items.splice(index, 0, marker);
  }

  return items;
}

export interface DaySummary {
  booked: number;
  free: number;
  label: string;
}

// Resumo do cabeçalho do dia. Conta EVENTOS, não slots: um corte de 1h que
// ocupa dois slots é um atendimento só na cabeça do barbeiro. O total ignora
// intervalo — é tempo de agenda, não tempo de expediente.
export function summarizeTimeline(items: TimelineItem[]): DaySummary {
  const booked = items.filter((item) => item.kind === "event").length;
  const free = items.filter((item) => item.kind === "free").length;

  if (booked === 0 && free === 0) {
    return { booked, free, label: "Nenhum horário" };
  }

  const minutes = items.reduce(
    (total, item) =>
      item.kind === "event" || item.kind === "free"
        ? total + toMinutes(item.endTime) - toMinutes(item.startTime)
        : total,
    0,
  );

  return {
    booked,
    free,
    label: [
      `${booked} ${booked === 1 ? "reservado" : "reservados"}`,
      `${free} ${free === 1 ? "livre" : "livres"}`,
      formatMinutes(minutes),
    ].join(" · "),
  };
}
