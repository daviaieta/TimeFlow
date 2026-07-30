import assert from "node:assert/strict";
import { test } from "node:test";
import { CustomerIdentityState } from "@prisma/client";
import {
  canLinkToExisting,
  claimableChannels,
  ExistingCustomer,
  fillMissingDisplayFields,
  mergeBookingTimestamps,
  normalizeEmail,
  normalizePhoneE164,
} from "./identityRules";

test("normalizeEmail apara e rebaixa para minúsculas", () => {
  assert.equal(normalizeEmail("  Davi@Exemplo.COM  "), "davi@exemplo.com");
});

test("normalizeEmail devolve null para o que não é endereço", () => {
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail("   "), null);
  assert.equal(normalizeEmail("davi"), null);
  assert.equal(normalizeEmail("davi@exemplo"), null);
  assert.equal(normalizeEmail("davi @exemplo.com"), null);
});

// Os três formatos são a MESMA pessoa. Se qualquer um deles saísse diferente,
// o mesmo cliente viraria duas ou três identidades no mesmo negócio.
test("normalizePhoneE164 colapsa os formatos que o brasileiro digita", () => {
  const esperado = "+5511999998888";
  assert.equal(normalizePhoneE164("11999998888"), esperado);
  assert.equal(normalizePhoneE164("(11) 99999-8888"), esperado);
  assert.equal(normalizePhoneE164("+55 11 99999-8888"), esperado);
  assert.equal(normalizePhoneE164("5511999998888"), esperado);
});

test("normalizePhoneE164 aceita fixo de 8 dígitos com DDD", () => {
  assert.equal(normalizePhoneE164("1133334444"), "+551133334444");
  assert.equal(normalizePhoneE164("551133334444"), "+551133334444");
});

// Gravar meio normalizado é pior que não gravar: viraria identidade errada.
test("normalizePhoneE164 recusa em vez de adivinhar", () => {
  assert.equal(normalizePhoneE164(null), null);
  assert.equal(normalizePhoneE164(""), null);
  assert.equal(normalizePhoneE164("123"), null);
  assert.equal(normalizePhoneE164("99999888"), null, "sem DDD não dá para saber a região");
  assert.equal(normalizePhoneE164("0999998888"), null, "DDD não começa em 0");
  assert.equal(normalizePhoneE164("999999999999999"), null);
});

function customer(overrides: Partial<ExistingCustomer> = {}): ExistingCustomer {
  return {
    id: 1,
    state: CustomerIdentityState.PROVISIONAL,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    mergedIntoId: null,
    ...overrides,
  };
}

// O teste que protege §11.1. Se ele passar a aceitar e-mail não verificado,
// registrar o e-mail da vítima e nunca confirmar entrega o histórico dela em
// todos os negócios para o atacante.
test("e-mail NÃO verificado nunca vincula entre negócios", () => {
  const naoVerificado = customer({
    state: CustomerIdentityState.ACTIVE,
    emailVerifiedAt: null,
  });

  assert.equal(canLinkToExisting(naoVerificado, "EMAIL", false), false);
  assert.equal(
    canLinkToExisting(naoVerificado, "EMAIL", true),
    false,
    "nem estando ligado a este negócio: a conta é ACTIVE, então o dono do e-mail é quem manda",
  );
});

test("e-mail verificado em conta ACTIVE vincula, e é o único vínculo entre negócios", () => {
  const verificado = customer({
    state: CustomerIdentityState.ACTIVE,
    emailVerifiedAt: new Date(),
  });
  assert.equal(canLinkToExisting(verificado, "EMAIL", false), true);
  // Encontrado pelo telefone, que NÃO está verificado nessa conta: não vale.
  assert.equal(canLinkToExisting(verificado, "PHONE", false), false);
});

test("provisional só é reusado dentro do próprio negócio", () => {
  const provisional = customer({ state: CustomerIdentityState.PROVISIONAL });
  assert.equal(canLinkToExisting(provisional, "EMAIL", true), true, "mesmo cliente voltando");
  assert.equal(
    canLinkToExisting(provisional, "EMAIL", false),
    false,
    "o mesmo e-mail digitado em outro negócio segue sendo outra identidade",
  );
});

test("SUSPENDED, ERASED e identidade já fundida nunca recebem vínculo novo", () => {
  assert.equal(
    canLinkToExisting(customer({ state: CustomerIdentityState.SUSPENDED }), "EMAIL", true),
    false,
  );
  assert.equal(
    canLinkToExisting(customer({ state: CustomerIdentityState.ERASED }), "EMAIL", true),
    false,
    "cliente apagado não volta a existir porque alguém digitou o e-mail dele",
  );
  assert.equal(
    canLinkToExisting(
      customer({
        state: CustomerIdentityState.ACTIVE,
        emailVerifiedAt: new Date(),
        mergedIntoId: 99,
      }),
      "EMAIL",
      false,
    ),
    false,
    "quem vale é a identidade vencedora, não a fundida",
  );
});

test("claimableChannels solta o canal já reivindicado por outra identidade", () => {
  assert.deepEqual(claimableChannels("davi@x.test", "+5511999998888", false, false), {
    email: "davi@x.test",
    phoneE164: "+5511999998888",
  });
  assert.deepEqual(claimableChannels("davi@x.test", "+5511999998888", true, false), {
    email: null,
    phoneE164: "+5511999998888",
  });
  assert.deepEqual(claimableChannels("davi@x.test", "+5511999998888", true, true), {
    email: null,
    phoneE164: null,
  });
  assert.deepEqual(claimableChannels(null, null, false, false), {
    email: null,
    phoneE164: null,
  });
});

test("firstBookedAt é escrito uma vez; lastBookedAt só avança", () => {
  const primeiro = new Date("2026-07-01T10:00:00.000Z");
  const depois = new Date("2026-07-20T10:00:00.000Z");

  assert.deepEqual(mergeBookingTimestamps({ firstBookedAt: null, lastBookedAt: null }, primeiro), {
    firstBookedAt: primeiro,
    lastBookedAt: primeiro,
  });

  assert.deepEqual(
    mergeBookingTimestamps({ firstBookedAt: primeiro, lastBookedAt: primeiro }, depois),
    { lastBookedAt: depois },
    "só o último avança",
  );

  assert.deepEqual(
    mergeBookingTimestamps({ firstBookedAt: primeiro, lastBookedAt: depois }, primeiro),
    {},
    "reprocessar a mesma reserva não move nada",
  );

  // Reserva registrada com data anterior à primeira conhecida (importação,
  // correção manual) recua o firstBookedAt e não toca no último.
  const antes = new Date("2026-06-01T10:00:00.000Z");
  assert.deepEqual(
    mergeBookingTimestamps({ firstBookedAt: primeiro, lastBookedAt: depois }, antes),
    { firstBookedAt: antes },
  );
});

test("campo de exibição vazio é preenchido; campo com valor nunca é sobrescrito", () => {
  assert.deepEqual(
    fillMissingDisplayFields(
      { displayPhone: null, displayEmail: null },
      { phone: "(11) 99999-8888", email: "davi@x.test" },
    ),
    { displayPhone: "(11) 99999-8888", displayEmail: "davi@x.test" },
  );

  assert.deepEqual(
    fillMissingDisplayFields(
      { displayPhone: "corrigido pela atendente", displayEmail: "corrigido@x.test" },
      { phone: "(11) 99999-8888", email: "davi@x.test" },
    ),
    {},
    "a correção da equipe sobrevive à reserva seguinte",
  );

  assert.deepEqual(
    fillMissingDisplayFields(
      { displayPhone: null, displayEmail: "ja@tem.test" },
      { phone: null, email: "outro@x.test" },
    ),
    {},
  );
});
