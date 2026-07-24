import assert from "node:assert/strict";
import { test } from "node:test";
import type { Availability } from "./types.ts";
import {
  formatDuration,
  formatMinutes,
  groupByDate,
  localDayKey,
  partitionByDay,
  summarizeDay,
  toMinutes,
} from "./schedule.ts";

function slot(overrides: Partial<Availability> & { id: number }): Availability {
  return {
    date: "2026-07-25T00:00:00.000Z",
    startTime: "09:00",
    endTime: "10:00",
    isBooked: false,
    clientName: null,
    locked: false,
    ...overrides,
  };
}

test("converte HH:mm em minutos", () => {
  assert.equal(toMinutes("09:00"), 540);
  assert.equal(toMinutes("00:30"), 30);
});

test("formata minutos em rótulo legível", () => {
  assert.equal(formatMinutes(60), "1h");
  assert.equal(formatMinutes(30), "30min");
  assert.equal(formatMinutes(90), "1h30");
  assert.equal(formatMinutes(180), "3h");
});

test("calcula duração de um horário", () => {
  assert.equal(formatDuration("09:00", "10:30"), "1h30");
});

test("agrupa por dia preservando a ordem", () => {
  const groups = groupByDate([
    slot({ id: 1, date: "2026-07-25T00:00:00.000Z" }),
    slot({ id: 2, date: "2026-07-26T00:00:00.000Z" }),
    slot({ id: 3, date: "2026-07-25T00:00:00.000Z", startTime: "11:00" }),
  ]);

  assert.deepEqual(
    groups.map(([day, slots]) => [day, slots.length]),
    [
      ["2026-07-25", 2],
      ["2026-07-26", 1],
    ],
  );
});

test("separa futuros de passados incluindo hoje nos futuros", () => {
  const { upcoming, past } = partitionByDay(
    [
      slot({ id: 1, date: "2026-07-24T00:00:00.000Z" }),
      slot({ id: 2, date: "2026-07-25T00:00:00.000Z" }),
      slot({ id: 3, date: "2026-07-26T00:00:00.000Z" }),
    ],
    "2026-07-25",
  );

  assert.deepEqual(
    upcoming.map((s) => s.id),
    [2, 3],
  );
  assert.deepEqual(
    past.map((s) => s.id),
    [1],
  );
});

test("resume ocupados, livres e total do dia", () => {
  const resumo = summarizeDay([
    slot({ id: 1, isBooked: true, clientName: "Marcos" }),
    slot({ id: 2, startTime: "10:00", endTime: "11:00" }),
    slot({ id: 3, startTime: "14:00", endTime: "15:30" }),
  ]);

  assert.equal(resumo.busy, 1);
  assert.equal(resumo.free, 2);
  assert.equal(resumo.label, "1 ocupado · 2 livres · 3h30");
});

test("resume no singular quando há um de cada", () => {
  const resumo = summarizeDay([
    slot({ id: 1, isBooked: true, clientName: "Marcos" }),
    slot({ id: 2, startTime: "10:00", endTime: "11:00" }),
  ]);

  assert.equal(resumo.label, "1 ocupado · 1 livre · 2h");
});

test("chave do dia usa data local, não UTC", () => {
  assert.equal(localDayKey(new Date(2026, 6, 25, 23, 30)), "2026-07-25");
});
