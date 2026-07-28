import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONTACT_RATE_LIMIT,
  isBot,
  isRateLimited,
  normalizeContact,
  withinWindow,
} from "./contactRules";

const HOUR = 60 * 60 * 1000;

test("honeypot preenchido é bot", () => {
  assert.equal(isBot({ website: "http://spam.example" }), true);
});

test("honeypot vazio, ausente ou só espaço é humano", () => {
  assert.equal(isBot({ website: "" }), false);
  assert.equal(isBot({ website: "   " }), false);
  assert.equal(isBot({}), false);
});

test("normalizeContact apara espaços e baixa o e-mail", () => {
  const result = normalizeContact({
    name: "  Zé da Silva ",
    email: "  ZE@Exemplo.COM ",
    phone: " 11 99999-0000 ",
    businessName: " Barbearia Old Brothers ",
    teamSize: "2-5",
    message: "  Quero saber dos planos.  ",
  });

  assert.deepEqual(result, {
    name: "Zé da Silva",
    email: "ze@exemplo.com",
    phone: "11 99999-0000",
    businessName: "Barbearia Old Brothers",
    teamSize: "2-5",
    message: "Quero saber dos planos.",
  });
});

// Campo opcional em branco vira null, não string vazia: no banco, "sem
// telefone" e "telefone vazio" precisam ser a mesma coisa.
test("normalizeContact transforma opcional em branco em null", () => {
  const result = normalizeContact({
    name: "Zé",
    email: "ze@exemplo.com",
    phone: "   ",
    message: "oi",
  });

  assert.equal(result.phone, null);
  assert.equal(result.businessName, null);
  assert.equal(result.teamSize, null);
});

test("withinWindow descarta o que é mais velho que a janela", () => {
  const now = 10 * HOUR;
  const timestamps = [now - 2 * HOUR, now - 30 * 60 * 1000, now];

  assert.deepEqual(withinWindow(timestamps, now, HOUR), [
    now - 30 * 60 * 1000,
    now,
  ]);
});

test("isRateLimited só bloqueia ao atingir o máximo dentro da janela", () => {
  const now = 10 * HOUR;
  const options = { windowMs: HOUR, max: 3 };

  assert.equal(isRateLimited([now, now], now, options), false);
  assert.equal(isRateLimited([now, now, now], now, options), true);
  // Três envios, mas velhos: a janela já passou, não bloqueia.
  const old = now - 2 * HOUR;
  assert.equal(isRateLimited([old, old, old], now, options), false);
});

test("o limite padrão é 3 por hora", () => {
  assert.deepEqual(CONTACT_RATE_LIMIT, { windowMs: HOUR, max: 3 });
});
