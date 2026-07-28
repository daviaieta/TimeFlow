import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ContactFormValues,
  TEAM_SIZE_OPTIONS,
  validateContactForm,
} from "./contact.ts";

function values(overrides: Partial<ContactFormValues> = {}): ContactFormValues {
  return {
    name: "Zé da Silva",
    email: "ze@exemplo.com",
    phone: "",
    businessName: "",
    teamSize: "",
    message: "Quero conhecer os planos para minha barbearia.",
    ...overrides,
  };
}

test("formulário completo não tem erros", () => {
  assert.deepEqual(validateContactForm(values()), {});
});

test("nome e mensagem são obrigatórios", () => {
  const errors = validateContactForm(values({ name: "  ", message: "" }));

  assert.equal(errors.name, "Informe seu nome.");
  assert.equal(errors.message, "Escreva sua mensagem.");
});

test("e-mail precisa ter formato válido", () => {
  assert.equal(
    validateContactForm(values({ email: "ze-arroba-exemplo" })).email,
    "Informe um e-mail válido.",
  );
  assert.equal(
    validateContactForm(values({ email: "" })).email,
    "Informe seu e-mail.",
  );
});

// O servidor corta em 2000; barrar antes evita um 400 sem explicação no campo.
test("mensagem acima de 2000 caracteres é rejeitada", () => {
  const errors = validateContactForm(values({ message: "a".repeat(2001) }));

  assert.equal(errors.message, "Mensagem muito longa (máximo de 2000 caracteres).");
});

// Os valores precisam bater com o enum do schema da rota pública.
test("as faixas de equipe são as aceitas pela API", () => {
  assert.deepEqual(
    TEAM_SIZE_OPTIONS.map((option) => option.value),
    ["1", "2-5", "6+"],
  );
});
