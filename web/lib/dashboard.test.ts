import assert from "node:assert/strict";
import { test } from "node:test";
import type { UpcomingBooking } from "./dashboard.ts";
import {
  formatCurrency,
  formatPercent,
  groupUpcomingByDay,
  heatIntensity,
  paceDelta,
  relativeDayLabel,
} from "./dashboard.ts";

// Intl pt-BR separa "R$" do número com espaço NÃO quebrável (U+00A0).
// Escrever um espaço comum aqui faz o teste falhar por um caractere invisível.
const NBSP = " ";

test("moeda formata a partir da string do Decimal", () => {
  assert.equal(formatCurrency("1250.5"), `R$${NBSP}1.250,50`);
  assert.equal(formatCurrency("0.00"), `R$${NBSP}0,00`);
});

test("percentual arredonda para inteiro", () => {
  assert.equal(formatPercent(0.256), "26%");
  assert.equal(formatPercent(0), "0%");
  assert.equal(formatPercent(1), "100%");
});

test("intensidade do heatmap distingue vazio de pouco ocupado", () => {
  assert.equal(heatIntensity(0), 0);
  assert.equal(heatIntensity(0.01), 1);
  assert.equal(heatIntensity(0.5), 2);
  assert.equal(heatIntensity(1), 4);
});

test("rótulo de dia marca hoje e amanhã", () => {
  assert.equal(relativeDayLabel("2026-07-25", "2026-07-25"), "Hoje");
  assert.equal(relativeDayLabel("2026-07-26", "2026-07-25"), "Amanhã");
});

test("rótulo de dia distante mostra data por extenso", () => {
  assert.equal(relativeDayLabel("2026-08-01", "2026-07-25"), "sáb, 01 ago");
});

test("virada de mês no amanhã continua sendo amanhã", () => {
  assert.equal(relativeDayLabel("2026-08-01", "2026-07-31"), "Amanhã");
});

test("agrupamento por dia preserva a ordem cronológica", () => {
  const row = (date: string, startTime: string): UpcomingBooking => ({
    availabilityId: Math.random(),
    date,
    startTime,
    endTime: "10:00",
    clientName: "Marcos",
    clientPhone: null,
    serviceName: null,
    employeeName: "Ana",
  });

  const groups = groupUpcomingByDay([
    row("2026-07-25", "09:00"),
    row("2026-07-25", "11:00"),
    row("2026-07-26", "09:00"),
  ]);

  assert.deepEqual(groups.map(([key]) => key), ["2026-07-25", "2026-07-26"]);
  assert.equal(groups[0][1].length, 2);
});

test("delta do ritmo compara os dois períodos", () => {
  assert.deepEqual(paceDelta(12, 8), { direction: "up", percent: 0.5 });
  assert.deepEqual(paceDelta(6, 8), { direction: "down", percent: -0.25 });
  assert.deepEqual(paceDelta(8, 8), { direction: "flat", percent: 0 });
});

test("período anterior zerado não vira divisão por zero", () => {
  assert.deepEqual(paceDelta(5, 0), { direction: "up", percent: null });
  assert.deepEqual(paceDelta(0, 0), { direction: "flat", percent: null });
});
