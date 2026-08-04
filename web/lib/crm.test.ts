import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendProfiles,
  applyProfileToBookingForm,
  buildCustomersQuery,
  customerContactLine,
  formatBookingWhen,
  formatCalendarDay,
  formatDate,
  formatPoints,
  isValidTagColor,
  shouldSearchCustomers,
  validateAdjustForm,
} from "./crm.ts";
import type { CustomerBooking, CustomerProfile } from "./types";

function profile(publicId: string, displayName = "Cliente"): CustomerProfile {
  return {
    publicId,
    displayName,
    displayPhone: null,
    displayEmail: null,
    status: "ACTIVE",
    bookingsCount: 0,
    totalSpent: "0",
    spendIsEstimated: false,
    loyaltyPoints: 0,
    firstBookedAt: null,
    lastBookedAt: null,
    createdAt: "2026-08-01T12:00:00.000Z",
    tags: [],
  };
}

test("buildCustomersQuery devolve string vazia sem filtro", () => {
  assert.equal(buildCustomersQuery({}), "");
  assert.equal(buildCustomersQuery({ status: "ALL" }), "");
  assert.equal(buildCustomersQuery({ search: "   " }), "", "busca em branco não vira filtro");
});

test("buildCustomersQuery combina filtro e cursor", () => {
  const query = buildCustomersQuery({
    search: "davi",
    status: "BLOCKED",
    tagId: 7,
    cursor: "abc",
    limit: 20,
  });

  const params = new URLSearchParams(query.slice(1));
  assert.equal(params.get("search"), "davi");
  assert.equal(params.get("status"), "BLOCKED");
  assert.equal(params.get("tagId"), "7");
  assert.equal(params.get("cursor"), "abc");
  assert.equal(params.get("limit"), "20");
});

test("buildCustomersQuery escapa o cursor opaco", () => {
  // O cursor é base64url e pode conter caracteres que quebrariam a URL se
  // fossem concatenados à mão.
  const query = buildCustomersQuery({ cursor: "a+b/c=d&e" });
  assert.ok(!query.includes("&e="), "o & do cursor não vira outro parâmetro");
  assert.equal(new URLSearchParams(query.slice(1)).get("cursor"), "a+b/c=d&e");
});

test("appendProfiles ignora item que já está na lista", () => {
  const current = [profile("a"), profile("b")];
  const merged = appendProfiles(current, [profile("b"), profile("c")]);

  assert.deepEqual(
    merged.map((item) => item.publicId),
    ["a", "b", "c"],
  );
});

test("appendProfiles preserva a ordem da página seguinte", () => {
  const merged = appendProfiles([profile("a")], [profile("c"), profile("b")]);
  assert.deepEqual(
    merged.map((item) => item.publicId),
    ["a", "c", "b"],
  );
});

test("customerContactLine junta o que existe e cai no traço", () => {
  assert.equal(
    customerContactLine({ displayPhone: "11 99999-8888", displayEmail: "d@x.test" }),
    "11 99999-8888 · d@x.test",
  );
  assert.equal(customerContactLine({ displayPhone: "11 99999-8888", displayEmail: null }), "11 99999-8888");
  assert.equal(customerContactLine({ displayPhone: null, displayEmail: "d@x.test" }), "d@x.test");
  assert.equal(customerContactLine({ displayPhone: null, displayEmail: null }), "—");
});

test("formatDate devolve traço para data ausente", () => {
  assert.equal(formatDate(null), "—");
  // Instante real: 12h UTC cai no mesmo dia em qualquer fuso do Brasil.
  assert.equal(formatDate("2026-08-03T12:00:00.000Z"), "03/08/2026");
});

test("formatCalendarDay lê o dia da agenda em UTC", () => {
  // A agenda grava o dia como meia-noite UTC. Lido no fuso local (UTC-3), o
  // dia 3 viraria dia 2 — o bug clássico de "a reserva aparece um dia antes".
  assert.equal(formatCalendarDay("2026-08-03T00:00:00.000Z"), "03/08/2026");
  assert.equal(formatCalendarDay(null), "—");
});

test("formatBookingWhen junta dia e hora, e tolera reserva sem slot", () => {
  const booking: CustomerBooking = {
    id: 1,
    createdAt: "2026-08-01T12:00:00.000Z",
    date: "2026-08-03T00:00:00.000Z",
    startTime: "09:00",
    endTime: "09:30",
    serviceName: "Corte",
    employeeName: "Ana",
    priceAtBooking: "50.00",
  };

  assert.equal(formatBookingWhen(booking), "03/08/2026 às 09:00");
  assert.equal(formatBookingWhen({ ...booking, startTime: null }), "03/08/2026");
  assert.equal(formatBookingWhen({ ...booking, date: null }), "—");
});

test("formatPoints marca o sinal", () => {
  assert.equal(formatPoints(50), "+50");
  assert.equal(formatPoints(-20), "−20");
});

test("validateAdjustForm recusa zero, decimal e motivo curto", () => {
  assert.deepEqual(validateAdjustForm({ points: "50", reason: "cortesia" }), {
    ok: true,
    points: 50,
    reason: "cortesia",
  });
  // Negativo é uso esperado: corrigir lançamento a mais.
  assert.equal(validateAdjustForm({ points: "-10", reason: "estorno" }).ok, true);

  assert.equal(validateAdjustForm({ points: "0", reason: "cortesia" }).ok, false);
  assert.equal(validateAdjustForm({ points: "1.5", reason: "cortesia" }).ok, false);
  assert.equal(validateAdjustForm({ points: "abc", reason: "cortesia" }).ok, false);
  assert.equal(validateAdjustForm({ points: "10", reason: "ab" }).ok, false);
  assert.equal(validateAdjustForm({ points: "10", reason: "x".repeat(201) }).ok, false);
});

test("isValidTagColor exige hex de 6 dígitos", () => {
  assert.ok(isValidTagColor("#1a2b3c"));
  assert.ok(!isValidTagColor("#fff"));
  assert.ok(!isValidTagColor("laranja"));
  assert.ok(!isValidTagColor("1a2b3c"));
});

test("shouldSearchCustomers ignora termo curto ou em branco", () => {
  assert.ok(!shouldSearchCustomers(""));
  assert.ok(!shouldSearchCustomers("   "));
  assert.ok(!shouldSearchCustomers("d"));
  assert.ok(!shouldSearchCustomers(" d "), "espaço não conta como caractere de busca");
  assert.ok(shouldSearchCustomers("da"));
  assert.ok(shouldSearchCustomers("Davi Aieta"));
});

test("applyProfileToBookingForm preenche a reserva com o cadastro", () => {
  const form = { clientName: "", clientPhone: "", clientEmail: "" };

  assert.deepEqual(
    applyProfileToBookingForm(form, {
      displayName: "Davi Aieta",
      displayPhone: "(11) 99999-8888",
      displayEmail: "davi@x.test",
    }),
    {
      clientName: "Davi Aieta",
      clientPhone: "(11) 99999-8888",
      clientEmail: "davi@x.test",
    },
  );
});

// O caso que motiva a função existir: o prontuário tem só o telefone, e a
// atendente já digitou o e-mail que o cliente acabou de ditar. Sobrescrever com
// null apagaria o que ela tinha na tela.
test("applyProfileToBookingForm não apaga o que o cadastro não tem", () => {
  const form = {
    clientName: "rascunho",
    clientPhone: "11912345678",
    clientEmail: "novo@x.test",
  };

  assert.deepEqual(
    applyProfileToBookingForm(form, {
      displayName: "Davi Aieta",
      displayPhone: null,
      displayEmail: null,
    }),
    {
      // O nome, sim, vem do cadastro: é o campo que identifica quem foi escolhido.
      clientName: "Davi Aieta",
      clientPhone: "11912345678",
      clientEmail: "novo@x.test",
    },
  );
});
