import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateGeneratedSlots } from "./generatePlan.ts";

test("estimativa multiplica slots por dia pelos dias úteis do período", () => {
  const total = estimateGeneratedSlots({
    startDate: "2026-08-03",
    endDate: "2026-08-14",
    weekdays: [1, 2, 3, 4, 5],
    workStart: "09:00",
    workEnd: "18:00",
    breakStart: "12:00",
    breakEnd: "13:00",
    slotMinutes: 30,
  });
  assert.equal(total, 160); // 10 dias × 16 slots
});

test("estimativa sem almoço e com um único dia da semana", () => {
  const total = estimateGeneratedSlots({
    startDate: "2026-08-03",
    endDate: "2026-08-09",
    weekdays: [6], // só sábado (08/08)
    workStart: "08:00",
    workEnd: "12:00",
    slotMinutes: 60,
  });
  assert.equal(total, 4);
});

test("período invertido estima zero", () => {
  const total = estimateGeneratedSlots({
    startDate: "2026-08-10",
    endDate: "2026-08-03",
    weekdays: [1],
    workStart: "09:00",
    workEnd: "10:00",
    slotMinutes: 30,
  });
  assert.equal(total, 0);
});

test("expediente invertido ou sem dias estima zero", () => {
  assert.equal(
    estimateGeneratedSlots({
      startDate: "2026-08-03",
      endDate: "2026-08-07",
      weekdays: [],
      workStart: "09:00",
      workEnd: "18:00",
      slotMinutes: 30,
    }),
    0,
  );
  assert.equal(
    estimateGeneratedSlots({
      startDate: "2026-08-03",
      endDate: "2026-08-07",
      weekdays: [1],
      workStart: "18:00",
      workEnd: "09:00",
      slotMinutes: 30,
    }),
    0,
  );
});
