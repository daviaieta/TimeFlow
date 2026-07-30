import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import {
  aggregateFromBookings,
  BackfillBooking,
  displayFieldsFor,
  existingProfileId,
  groupBookings,
  groupKeyFor,
  pendingBookings,
} from "./crmBackfillRules";

let nextId = 1;

function booking(overrides: Partial<BackfillBooking> = {}): BackfillBooking {
  return {
    id: nextId++,
    createdAt: new Date("2026-07-01T10:00:00.000Z"),
    clientName: "Davi",
    clientPhone: "11999998888",
    clientEmail: null,
    priceAtBooking: new Prisma.Decimal(50),
    servicePrice: new Prisma.Decimal(50),
    profileId: null,
    ...overrides,
  };
}

test("a chave é o e-mail quando existe, o telefone quando não", () => {
  assert.deepEqual(groupKeyFor(booking({ clientEmail: "Davi@Exemplo.TEST" })), {
    kind: "EMAIL",
    value: "davi@exemplo.test",
  });
  assert.deepEqual(groupKeyFor(booking({ clientEmail: null })), {
    kind: "PHONE",
    value: "+5511999998888",
  });
});

test("sem canal reconhecível não há chave: fica sem resolver", () => {
  assert.equal(groupKeyFor(booking({ clientEmail: "nao-e-email", clientPhone: "123" })), null);
});

test("formatos diferentes do mesmo telefone caem no mesmo grupo", () => {
  const { groups, unresolved } = groupBookings([
    booking({ clientPhone: "11999998888" }),
    booking({ clientPhone: "(11) 99999-8888" }),
    booking({ clientPhone: "+55 11 99999-8888" }),
  ]);

  assert.equal(unresolved.length, 0);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].bookings.length, 3);
});

// A subvinculação aceita e registrada em crmBackfillRules: o lado seguro do
// erro. Unir por qualquer canal em comum uniria também duas pessoas que
// dividem um telefone, e desfazer isso depois é impossível.
test("mesma pessoa com e sem e-mail cai em dois grupos, e isso é de propósito", () => {
  const { groups } = groupBookings([
    booking({ clientEmail: "davi@exemplo.test", clientPhone: "11999998888" }),
    booking({ clientEmail: null, clientPhone: "11999998888" }),
  ]);

  assert.equal(groups.length, 2, "subvincular é preferível a inventar associação");
});

test("nome NUNCA agrupa: é sinal fraco", () => {
  const { groups, unresolved } = groupBookings([
    booking({ clientName: "Davi", clientEmail: "um@x.test" }),
    booking({ clientName: "Davi", clientEmail: "outro@x.test" }),
    booking({ clientName: "Davi", clientEmail: "nao-e-email", clientPhone: "123" }),
  ]);

  assert.equal(groups.length, 2, "dois e-mails distintos, dois grupos");
  assert.equal(unresolved.length, 1, "e o sem canal não entra em nenhum");
});

// Ordem estável é requisito, não estética: reivindicar canal é corrida global
// entre negócios, então ordem instável mudaria o resultado a cada execução.
test("grupos saem em ordem de chave e reservas em ordem de id", () => {
  const { groups } = groupBookings([
    booking({ id: 30, clientEmail: "zebra@x.test" }),
    booking({ id: 10, clientEmail: "alfa@x.test" }),
    booking({ id: 20, clientEmail: "alfa@x.test" }),
  ]);

  assert.deepEqual(
    groups.map((group) => group.key.value),
    ["alfa@x.test", "zebra@x.test"],
  );
  assert.deepEqual(groups[0].bookings.map((item) => item.id), [10, 20]);
});

test("agregado soma o preço congelado e marca exato", () => {
  const aggregate = aggregateFromBookings([
    booking({ priceAtBooking: new Prisma.Decimal(50) }),
    booking({ priceAtBooking: new Prisma.Decimal("30.50") }),
  ]);

  assert.equal(aggregate.bookingsCount, 2);
  assert.equal(aggregate.totalSpent.toString(), "80.5");
  assert.equal(aggregate.spendIsEstimated, false);
});

// Uma reserva sem retrato de preço contamina o prontuário inteiro: o número
// deixa de ser exato, e a interface tem que poder dizer isso.
test("uma única reserva sem preço congelado torna o gasto estimado", () => {
  const aggregate = aggregateFromBookings([
    booking({ priceAtBooking: new Prisma.Decimal(50) }),
    booking({ priceAtBooking: null, servicePrice: new Prisma.Decimal(70) }),
  ]);

  assert.equal(aggregate.totalSpent.toString(), "120", "o nulo entra pelo preço atual");
  assert.equal(aggregate.spendIsEstimated, true);
});

test("agregado encontra a primeira e a última reserva", () => {
  const meio = new Date("2026-07-10T10:00:00.000Z");
  const antes = new Date("2026-06-01T10:00:00.000Z");
  const depois = new Date("2026-07-25T10:00:00.000Z");

  const aggregate = aggregateFromBookings([
    booking({ createdAt: meio }),
    booking({ createdAt: depois }),
    booking({ createdAt: antes }),
  ]);

  assert.equal(aggregate.firstBookedAt?.getTime(), antes.getTime());
  assert.equal(aggregate.lastBookedAt?.getTime(), depois.getTime());
});

// Recalcular do zero é o que torna o backfill idempotente: rodar duas vezes
// sobre as mesmas linhas dá o mesmo número, sem contador inflado.
test("recalcular o mesmo conjunto duas vezes dá o mesmo resultado", () => {
  const bookings = [booking(), booking(), booking()];
  const primeira = aggregateFromBookings(bookings);
  const segunda = aggregateFromBookings(bookings);

  assert.equal(primeira.bookingsCount, segunda.bookingsCount);
  assert.equal(primeira.totalSpent.toString(), segunda.totalSpent.toString());
});

test("grupo vazio não vira NaN nem data inventada", () => {
  const aggregate = aggregateFromBookings([]);
  assert.equal(aggregate.bookingsCount, 0);
  assert.equal(aggregate.totalSpent.toString(), "0");
  assert.equal(aggregate.firstBookedAt, null);
  assert.equal(aggregate.lastBookedAt, null);
});

// O grupo entra inteiro no agrupamento — inclusive reserva já vinculada — só
// para revelar qual prontuário é o do contato. Quem recebe vínculo é só o que
// ainda está solto.
test("pendingBookings separa o que falta vincular do que já está", () => {
  const { groups } = groupBookings([
    booking({ id: 1, clientEmail: "davi@x.test", profileId: 7 }),
    booking({ id: 2, clientEmail: "davi@x.test", profileId: null }),
    booking({ id: 3, clientEmail: "davi@x.test", profileId: null }),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(pendingBookings(groups[0]).map((item) => item.id), [2, 3]);
  assert.equal(existingProfileId(groups[0]), 7, "o prontuário vem da reserva já vinculada");
});

test("grupo sem nenhum vínculo não tem prontuário para reusar", () => {
  const { groups } = groupBookings([booking({ clientEmail: "novo@x.test" })]);
  assert.equal(existingProfileId(groups[0]), null);
});

// Determinismo quando há mais de um vínculo no grupo: ganha o da reserva mais
// antiga, sempre.
test("com dois vínculos no grupo, o prontuário da reserva mais antiga ganha", () => {
  const { groups } = groupBookings([
    booking({ id: 20, clientEmail: "davi@x.test", profileId: 99 }),
    booking({ id: 10, clientEmail: "davi@x.test", profileId: 42 }),
  ]);

  assert.equal(existingProfileId(groups[0]), 42);
});

test("exibição vem da reserva mais antiga, com o primeiro e-mail que aparecer", () => {
  const fields = displayFieldsFor([
    booking({ id: 1, clientName: "Davi", clientPhone: "11999998888", clientEmail: null }),
    booking({ id: 2, clientName: "Davi Silva", clientEmail: "davi@x.test" }),
  ]);

  assert.equal(fields.displayName, "Davi", "critério fixo: a mais antiga");
  assert.equal(fields.displayPhone, "11999998888");
  assert.equal(fields.displayEmail, "davi@x.test");
});
