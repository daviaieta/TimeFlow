import assert from "node:assert/strict";
import { test } from "node:test";
import {
  businessToday,
  clampPage,
  toAvailabilityDto,
  totalPagesFor,
  utcMidnight,
} from "./availabilityRules";

test("slot livre não tem cliente", () => {
  const dto = toAvailabilityDto({
    id: 1,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
    isBooked: false,
    booking: null,
  });

  assert.equal(dto.clientName, null);
  assert.equal(dto.isBooked, false);
});

test("slot reservado usa o nome do cliente do booking", () => {
  const dto = toAvailabilityDto({
    id: 3,
    date: new Date("2026-08-10T00:00:00.000Z"),
    startTime: "11:00",
    endTime: "12:30",
    isBooked: true,
    booking: { id: 9, clientName: "Cliente Externo" },
  });

  assert.equal(dto.clientName, "Cliente Externo");
  assert.equal(dto.date, "2026-08-10T00:00:00.000Z");
  assert.equal(dto.isBooked, true);
});

test("utcMidnight zera a hora e mantém o dia UTC", () => {
  const result = utcMidnight(new Date("2026-07-25T23:47:12.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("utcMidnight numa data já em meia-noite não muda", () => {
  const result = utcMidnight(new Date("2026-07-25T00:00:00.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("businessToday usa o dia em America/Sao_Paulo, não o dia UTC", () => {
  // 21:30 em São Paulo (UTC-3) já é 00:30 do dia seguinte em UTC.
  const result = businessToday(new Date("2026-07-26T00:30:00.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("businessToday na virada da meia-noite local", () => {
  // 00:30 em São Paulo é 03:30 UTC do mesmo dia.
  const result = businessToday(new Date("2026-07-25T03:30:00.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("totalPagesFor divide exato", () => {
  assert.equal(totalPagesFor(14, 7), 2);
});

test("totalPagesFor arredonda pra cima quando sobra resto", () => {
  assert.equal(totalPagesFor(15, 7), 3);
});

test("totalPagesFor sem dia nenhum ainda devolve 1 página", () => {
  assert.equal(totalPagesFor(0, 7), 1);
});

test("clampPage abaixo de 1 vira 1", () => {
  assert.equal(clampPage(0, 3), 1);
  assert.equal(clampPage(-5, 3), 1);
});

test("clampPage acima do total vira o total", () => {
  assert.equal(clampPage(9, 3), 3);
});

test("clampPage dentro do range não muda", () => {
  assert.equal(clampPage(2, 3), 2);
});
