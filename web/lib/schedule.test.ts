import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatDuration,
  formatMinutes,
  localDayKey,
  shiftDayKey,
  toMinutes,
} from "./schedule.ts";

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

test("chave do dia usa data local, não UTC", () => {
  assert.equal(localDayKey(new Date(2026, 6, 25, 23, 30)), "2026-07-25");
});

test("shiftDayKey anda um dia pra frente e pra trás", () => {
  assert.equal(shiftDayKey("2026-07-25", 1), "2026-07-26");
  assert.equal(shiftDayKey("2026-07-25", -1), "2026-07-24");
});

test("shiftDayKey atravessa virada de mês e de ano", () => {
  assert.equal(shiftDayKey("2026-07-31", 1), "2026-08-01");
  assert.equal(shiftDayKey("2026-01-01", -1), "2025-12-31");
});

test("shiftDayKey acerta 29 de fevereiro em ano bissexto", () => {
  assert.equal(shiftDayKey("2028-02-28", 1), "2028-02-29");
});
