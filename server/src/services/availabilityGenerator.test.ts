import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enumerateDays,
  planAvailabilities,
  sliceWorkday,
} from "./availabilityGenerator";

test("fatia o expediente em slots inteiros", () => {
  assert.deepEqual(sliceWorkday({ workStart: "09:00", workEnd: "10:30" }, 30), [
    { startTime: "09:00", endTime: "09:30" },
    { startTime: "09:30", endTime: "10:00" },
    { startTime: "10:00", endTime: "10:30" },
  ]);
});

test("slot que não cabe no fim do expediente fica de fora", () => {
  const slots = sliceWorkday({ workStart: "09:00", workEnd: "10:20" }, 30);
  assert.equal(slots.length, 2);
  assert.equal(slots[1].endTime, "10:00");
});

test("almoço abre um buraco e retoma no fim da pausa", () => {
  const slots = sliceWorkday(
    { workStart: "11:00", workEnd: "14:00", breakStart: "12:00", breakEnd: "13:00" },
    45,
  );
  assert.deepEqual(slots, [
    { startTime: "11:00", endTime: "11:45" },
    { startTime: "13:00", endTime: "13:45" },
  ]);
});

test("expediente 09-18 com almoço 12-13 e 30min dá 16 slots", () => {
  const slots = sliceWorkday(
    { workStart: "09:00", workEnd: "18:00", breakStart: "12:00", breakEnd: "13:00" },
    30,
  );
  assert.equal(slots.length, 16);
});

test("enumera só os dias da semana pedidos", () => {
  // 2026-07-27 é segunda; 2026-08-02 é domingo
  const days = enumerateDays("2026-07-27", "2026-08-02", [1, 3, 5]);
  assert.deepEqual(days, ["2026-07-27", "2026-07-29", "2026-07-31"]);
});

test("plano pula slots que sobrepõem horário existente", () => {
  const { kept, skippedOverlap } = planAvailabilities({
    startDate: "2026-07-27",
    endDate: "2026-07-27",
    weekdays: [1],
    window: { workStart: "09:00", workEnd: "11:00" },
    slotMinutes: 30,
    existing: [
      { date: new Date("2026-07-27T00:00:00.000Z"), startTime: "09:15", endTime: "10:15" },
    ],
    now: new Date(2026, 6, 24, 8, 0),
  });

  // 09:00, 09:30 e 10:00 cruzam com 09:15–10:15; sobra 10:30
  assert.deepEqual(
    kept.map((s) => s.startTime),
    ["10:30"],
  );
  assert.equal(skippedOverlap, 3);
});

test("plano corta slots do passado no dia de hoje", () => {
  const { kept } = planAvailabilities({
    startDate: "2026-07-24",
    endDate: "2026-07-24",
    weekdays: [5], // sexta
    window: { workStart: "09:00", workEnd: "12:00" },
    slotMinutes: 60,
    existing: [],
    now: new Date(2026, 6, 24, 10, 30),
  });

  assert.deepEqual(
    kept.map((s) => s.startTime),
    ["11:00"],
  );
});
