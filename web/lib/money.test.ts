import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPriceInput, parsePrice } from "./money.ts";

test("vírgula e ponto chegam ao mesmo número", () => {
  assert.equal(parsePrice("45,90"), 45.9);
  assert.equal(parsePrice("45.90"), 45.9);
});

test("valor inteiro dispensa os centavos", () => {
  assert.equal(parsePrice("45"), 45);
  assert.equal(parsePrice("0"), 0);
});

test("espaço em volta não invalida o que o usuário digitou", () => {
  assert.equal(parsePrice("  45,90  "), 45.9);
});

test("mais de dois decimais é recusado", () => {
  assert.equal(parsePrice("45,901"), null);
});

// Cada um destes viraria NaN num Number() direto, e NaN vira 0 na soma.
test("texto que não é preço vira null, não NaN", () => {
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("R$ 45,90"), null);
  assert.equal(parsePrice("abc"), null);
  assert.equal(parsePrice("-45"), null);
  assert.equal(parsePrice("45,"), null);
});

test("o preço da API abre no formulário com vírgula", () => {
  assert.equal(formatPriceInput("45.00"), "45,00");
  assert.equal(formatPriceInput("1200.50"), "1200,50");
});
