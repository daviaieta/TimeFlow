import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEmail, requiresCurrentPassword } from "./accountRules";

test("normalizeEmail apara espaços e baixa a caixa", () => {
  assert.equal(normalizeEmail("  Jose@X.com "), "jose@x.com");
  assert.equal(normalizeEmail("JOSE@X.COM"), "jose@x.com");
  assert.equal(normalizeEmail("jose@x.com"), "jose@x.com");
});

test("normalizeEmail de string vazia não quebra", () => {
  assert.equal(normalizeEmail(""), "");
  assert.equal(normalizeEmail("   "), "");
});

test("e-mail diferente exige a senha atual", () => {
  assert.equal(requiresCurrentPassword("jose@x.com", "maria@x.com"), true);
});

test("mesmo e-mail não exige senha", () => {
  assert.equal(requiresCurrentPassword("jose@x.com", "jose@x.com"), false);
});

// Os dois chegam normalizados, então reenviar o mesmo endereço com outra caixa
// ou com espaços não é uma troca e não pode pedir senha à toa.
test("caixa e espaços não contam como troca depois de normalizar", () => {
  const current = normalizeEmail("Jose@X.com");
  const next = normalizeEmail("  jose@x.com  ");

  assert.equal(requiresCurrentPassword(current, next), false);
});
