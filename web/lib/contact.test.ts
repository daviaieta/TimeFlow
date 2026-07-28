import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BUSINESS_NAME_MAX_LENGTH,
  type ContactFormValues,
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
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

// Os limites abaixo espelham `contactSchema` (maxLength) em
// server/src/routes/publicRoutes.ts, para o erro aparecer no campo antes de
// virar um 400 genérico do servidor.
test("nome respeita o limite do servidor (80 caracteres)", () => {
  const noError = validateContactForm(values({ name: "a".repeat(NAME_MAX_LENGTH) }));
  assert.equal(noError.name, undefined);

  const withError = validateContactForm(
    values({ name: "a".repeat(NAME_MAX_LENGTH + 1) }),
  );
  assert.equal(
    withError.name,
    `Nome muito longo (máximo de ${NAME_MAX_LENGTH} caracteres).`,
  );
});

test("e-mail respeita o limite do servidor (120 caracteres)", () => {
  const domain = "@exemplo.com";
  const emailAtCap = "a".repeat(EMAIL_MAX_LENGTH - domain.length) + domain;
  const emailOverCap = "a".repeat(EMAIL_MAX_LENGTH - domain.length + 1) + domain;
  assert.equal(emailAtCap.length, EMAIL_MAX_LENGTH);
  assert.equal(emailOverCap.length, EMAIL_MAX_LENGTH + 1);

  const noError = validateContactForm(values({ email: emailAtCap }));
  assert.equal(noError.email, undefined);

  const withError = validateContactForm(values({ email: emailOverCap }));
  assert.equal(
    withError.email,
    `E-mail muito longo (máximo de ${EMAIL_MAX_LENGTH} caracteres).`,
  );
});

test("telefone respeita o limite do servidor (20 caracteres)", () => {
  const noError = validateContactForm(
    values({ phone: "1".repeat(PHONE_MAX_LENGTH) }),
  );
  assert.equal(noError.phone, undefined);

  const withError = validateContactForm(
    values({ phone: "1".repeat(PHONE_MAX_LENGTH + 1) }),
  );
  assert.equal(
    withError.phone,
    `Telefone muito longo (máximo de ${PHONE_MAX_LENGTH} caracteres).`,
  );
});

test("nome do negócio respeita o limite do servidor (80 caracteres)", () => {
  const noError = validateContactForm(
    values({ businessName: "a".repeat(BUSINESS_NAME_MAX_LENGTH) }),
  );
  assert.equal(noError.businessName, undefined);

  const withError = validateContactForm(
    values({ businessName: "a".repeat(BUSINESS_NAME_MAX_LENGTH + 1) }),
  );
  assert.equal(
    withError.businessName,
    `Nome do negócio muito longo (máximo de ${BUSINESS_NAME_MAX_LENGTH} caracteres).`,
  );
});
