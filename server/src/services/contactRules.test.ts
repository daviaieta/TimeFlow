import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTACT_RATE_LIMIT, isBot, normalizeContact } from "./contactRules";

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

test("o limite padrão é 3 por hora", () => {
  assert.deepEqual(CONTACT_RATE_LIMIT, { windowMs: HOUR, max: 3 });
});
