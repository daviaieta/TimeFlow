import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayChipLabel,
  formatPrice,
  groupSlotsByDay,
  isValidPhone,
  type PublicSlot,
} from "./publicBooking.ts";

function slot(id: number, date: string, startTime = "09:00"): PublicSlot {
  return { id, date, startTime, endTime: "10:00" };
}

test("agrupa slots por dia preservando a ordem", () => {
  const groups = groupSlotsByDay([
    slot(1, "2026-07-25T00:00:00.000Z"),
    slot(2, "2026-07-25T00:00:00.000Z", "14:00"),
    slot(3, "2026-07-26T00:00:00.000Z"),
  ]);

  assert.deepEqual(
    groups.map(([day, slots]) => [day, slots.length]),
    [
      ["2026-07-25", 2],
      ["2026-07-26", 1],
    ],
  );
});

test("chip do dia de hoje vira 'Hoje'", () => {
  assert.equal(dayChipLabel("2026-07-24", "2026-07-24"), "Hoje");
});

test("chip de outro dia mostra semana e data", () => {
  // 2026-07-25 é sábado
  assert.equal(dayChipLabel("2026-07-25", "2026-07-24"), "sáb, 25 jul");
  // 2026-08-03 é segunda
  assert.equal(dayChipLabel("2026-08-03", "2026-07-24"), "seg, 03 ago");
});

test("telefone válido tem pelo menos 8 dígitos", () => {
  assert.equal(isValidPhone("(11) 99999-0000"), true);
  assert.equal(isValidPhone("11999990000"), true);
  assert.equal(isValidPhone("123"), false);
  assert.equal(isValidPhone("abc-def"), false);
});

test("preço decimal vira moeda brasileira", () => {
  assert.equal(formatPrice("50"), "R$ 50,00");
  assert.equal(formatPrice("50.5"), "R$ 50,50");
  assert.equal(formatPrice("1250.75"), "R$ 1250,75");
});
