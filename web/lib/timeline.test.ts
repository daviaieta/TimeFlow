import assert from "node:assert/strict";
import { test } from "node:test";
import type { Availability, BookingSummary } from "./types.ts";
import { buildTimeline, type TimelineEvent, type TimelineItem } from "./timeline.ts";

function booking(overrides: Partial<BookingSummary> & { id: number }): BookingSummary {
  return {
    clientName: "Rodrigo Silva",
    clientPhone: "11999998888",
    clientEmail: null,
    service: { id: 1, name: "Corte Masculino" },
    // A timeline não lê o prontuário — quem usa é o diálogo de detalhe. O
    // default é o caso mais comum de qualquer forma: reserva sem vínculo.
    profile: null,
    ...overrides,
  };
}

function slot(overrides: Partial<Availability> & { id: number }): Availability {
  return {
    date: "2026-07-25T00:00:00.000Z",
    startTime: "09:00",
    endTime: "09:30",
    isBooked: false,
    booking: null,
    ...overrides,
  };
}

// Dia inteiro no futuro, pra nenhum teste depender de "agora" sem querer.
const FUTURE = new Date(2026, 6, 24, 12, 0);
const DAY = "2026-07-25";

function kinds(items: TimelineItem[]): string[] {
  return items.map((item) => item.kind);
}

test("dia sem horário nenhum não gera item", () => {
  assert.deepEqual(buildTimeline([], DAY, FUTURE), []);
});

test("slots livres viram itens livres na ordem", () => {
  const items = buildTimeline(
    [
      slot({ id: 1, startTime: "09:00", endTime: "09:30" }),
      slot({ id: 2, startTime: "09:30", endTime: "10:00" }),
    ],
    DAY,
    FUTURE,
  );

  assert.deepEqual(kinds(items), ["free", "free"]);
  assert.deepEqual(
    items.filter((item) => item.kind === "free").map((item) => item.startTime),
    ["09:00", "09:30"],
  );
});

test("slots seguidos da mesma reserva colapsam num evento só", () => {
  const items = buildTimeline(
    [
      slot({ id: 1, startTime: "09:00", endTime: "09:30", isBooked: true, booking: booking({ id: 7 }) }),
      slot({ id: 2, startTime: "09:30", endTime: "10:00", isBooked: true, booking: booking({ id: 7 }) }),
    ],
    DAY,
    FUTURE,
  );

  assert.deepEqual(kinds(items), ["event"]);
  const event = items[0] as TimelineEvent;
  assert.equal(event.startTime, "09:00");
  assert.equal(event.endTime, "10:00");
  assert.equal(event.durationMinutes, 60);
  assert.deepEqual(event.slotIds, [1, 2]);
});

test("reservas diferentes coladas não viram o mesmo evento", () => {
  const items = buildTimeline(
    [
      slot({ id: 1, startTime: "09:00", endTime: "09:30", isBooked: true, booking: booking({ id: 7 }) }),
      slot({ id: 2, startTime: "09:30", endTime: "10:00", isBooked: true, booking: booking({ id: 8 }) }),
    ],
    DAY,
    FUTURE,
  );

  assert.deepEqual(kinds(items), ["event", "event"]);
});

// Um slot pode ficar isBooked sem booking carregado só se o backend mudar de
// forma; a timeline não pode desenhar um evento sem nome nem serviço.
test("slot marcado como reservado mas sem booking cai como livre", () => {
  const items = buildTimeline(
    [slot({ id: 1, isBooked: true, booking: null })],
    DAY,
    FUTURE,
  );

  assert.deepEqual(kinds(items), ["free"]);
});

test("buraco entre dois horários vira intervalo", () => {
  const items = buildTimeline(
    [
      slot({ id: 1, startTime: "11:30", endTime: "12:00" }),
      slot({ id: 2, startTime: "13:00", endTime: "13:30" }),
    ],
    DAY,
    FUTURE,
  );

  assert.deepEqual(kinds(items), ["free", "gap", "free"]);
  assert.deepEqual(
    items
      .filter((item) => item.kind === "gap")
      .map((item) => [item.startTime, item.endTime, item.minutes]),
    [["12:00", "13:00", 60]],
  );
});

test("horários encostados não geram intervalo", () => {
  const items = buildTimeline(
    [
      slot({ id: 1, startTime: "09:00", endTime: "09:30" }),
      slot({ id: 2, startTime: "09:30", endTime: "10:00" }),
    ],
    DAY,
    FUTURE,
  );

  assert.equal(kinds(items).includes("gap"), false);
});

test("dia anterior a hoje marca tudo como passado", () => {
  const items = buildTimeline(
    [slot({ id: 1, startTime: "23:00", endTime: "23:30" })],
    "2026-07-24",
    new Date(2026, 6, 25, 8, 0),
  );

  assert.equal(items[0].kind === "free" && items[0].past, true);
});

test("dia futuro não marca nada como passado", () => {
  const items = buildTimeline(
    [slot({ id: 1, startTime: "07:00", endTime: "07:30" })],
    "2026-07-26",
    new Date(2026, 6, 25, 8, 0),
  );

  assert.equal(items[0].kind === "free" && items[0].past, false);
});

test("em hoje, só o que já terminou conta como passado", () => {
  const items = buildTimeline(
    [
      slot({ id: 1, startTime: "09:00", endTime: "09:30" }),
      slot({ id: 2, startTime: "10:00", endTime: "10:30" }),
    ],
    DAY,
    new Date(2026, 6, 25, 9, 45),
  );

  const free = items.filter((item) => item.kind === "free");
  assert.deepEqual(
    free.map((item) => item.past),
    [true, false],
  );
});

test("evento em andamento ainda não é passado", () => {
  const items = buildTimeline(
    [slot({ id: 1, startTime: "09:00", endTime: "10:00", isBooked: true, booking: booking({ id: 7 }) })],
    DAY,
    new Date(2026, 6, 25, 9, 30),
  );

  assert.equal(items[0].kind === "event" && items[0].past, false);
});

test("hoje ganha o marcador de agora antes do próximo horário", () => {
  const items = buildTimeline(
    [
      slot({ id: 1, startTime: "09:00", endTime: "09:30" }),
      slot({ id: 2, startTime: "10:00", endTime: "10:30" }),
    ],
    DAY,
    new Date(2026, 6, 25, 9, 45),
  );

  assert.deepEqual(kinds(items), ["free", "gap", "now", "free"]);
  const marker = items.find((item) => item.kind === "now");
  assert.equal(marker?.kind === "now" && marker.time, "09:45");
});

test("agora antes do expediente aparece no topo", () => {
  const items = buildTimeline(
    [slot({ id: 1, startTime: "09:00", endTime: "09:30" })],
    DAY,
    new Date(2026, 6, 25, 7, 10),
  );

  assert.deepEqual(kinds(items), ["now", "free"]);
});

test("agora depois do expediente aparece no fim", () => {
  const items = buildTimeline(
    [slot({ id: 1, startTime: "09:00", endTime: "09:30" })],
    DAY,
    new Date(2026, 6, 25, 21, 0),
  );

  assert.deepEqual(kinds(items), ["free", "now"]);
});

test("dia que não é hoje não ganha marcador de agora", () => {
  const items = buildTimeline(
    [slot({ id: 1, startTime: "09:00", endTime: "09:30" })],
    "2026-07-26",
    new Date(2026, 6, 25, 9, 0),
  );

  assert.equal(kinds(items).includes("now"), false);
});

test("marcador de agora não parte um evento em andamento", () => {
  const items = buildTimeline(
    [
      slot({ id: 1, startTime: "09:00", endTime: "09:30", isBooked: true, booking: booking({ id: 7 }) }),
      slot({ id: 2, startTime: "09:30", endTime: "10:00", isBooked: true, booking: booking({ id: 7 }) }),
      slot({ id: 3, startTime: "10:00", endTime: "10:30" }),
    ],
    DAY,
    new Date(2026, 6, 25, 9, 40),
  );

  assert.deepEqual(kinds(items), ["event", "now", "free"]);
});

test("slots fora de ordem são ordenados antes de montar", () => {
  const items = buildTimeline(
    [
      slot({ id: 2, startTime: "10:00", endTime: "10:30" }),
      slot({ id: 1, startTime: "09:00", endTime: "09:30" }),
    ],
    DAY,
    FUTURE,
  );

  assert.deepEqual(
    items.filter((item) => item.kind === "free").map((item) => item.startTime),
    ["09:00", "10:00"],
  );
});

test("chaves dos itens são únicas", () => {
  const items = buildTimeline(
    [
      slot({ id: 1, startTime: "09:00", endTime: "09:30" }),
      slot({ id: 2, startTime: "11:00", endTime: "11:30", isBooked: true, booking: booking({ id: 7 }) }),
      slot({ id: 3, startTime: "14:00", endTime: "14:30" }),
    ],
    DAY,
    FUTURE,
  );

  const keys = items.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
});
