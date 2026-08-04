// A ordem destes dois imports é parte do teste: testDb aponta o Prisma para o
// schema de teste e enableCrm liga a flag, ambos antes de `../app` avaliar
// `config/env`.
import "./testDb";
import "./enableCrm";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { CustomerIdentityState, CustomerLinkSource, Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { env } from "../config/env";
import { seedBookableBusiness } from "./factories";
import { ensureTestSchema, resetDatabase, testPrisma } from "./testDb";

let app: FastifyInstance;

before(async () => {
  await ensureTestSchema();
  assert.equal(env.crmEnabled, true, "a suíte inteira depende da flag estar ligada");
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
});

function payload(
  availabilityId: number,
  serviceId: number,
  clientName: string,
  extra: { clientPhone?: string; clientEmail?: string } = {},
) {
  return {
    availabilityId,
    serviceId,
    clientName,
    clientPhone: extra.clientPhone ?? "11999998888",
    ...(extra.clientEmail ? { clientEmail: extra.clientEmail } : {}),
  };
}

function book(slug: string, body: ReturnType<typeof payload>) {
  return app.inject({
    method: "POST",
    url: `/public/businesses/${slug}/bookings`,
    payload: body,
  });
}

test("reserva de convidado cria identidade provisional e prontuário do negócio", async () => {
  const { business, service, slots } = await seedBookableBusiness("crm-primeira");

  const response = await book(
    business.slug,
    payload(slots[0].id, service.id, "Davi", { clientEmail: "Davi@Exemplo.TEST" }),
  );
  assert.equal(response.statusCode, 201);

  const customer = await testPrisma.customer.findFirstOrThrow();
  assert.equal(customer.state, CustomerIdentityState.PROVISIONAL);
  assert.equal(customer.passwordHash, null, "provisional não faz login por construção");
  assert.equal(customer.email, "davi@exemplo.test", "identidade guarda o normalizado");
  assert.equal(customer.emailVerifiedAt, null, "digitar não é verificar");
  assert.equal(customer.phoneE164, "+5511999998888");

  const profile = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(profile.businessId, business.id);
  assert.equal(profile.customerId, customer.id);
  assert.equal(profile.source, CustomerLinkSource.PUBLIC_BOOKING);
  assert.equal(profile.bookingsCount, 1);
  assert.equal(profile.totalSpent.toString(), service.price.toString());
  assert.equal(profile.spendIsEstimated, false, "reserva nova tem preço congelado");
  assert.ok(profile.firstBookedAt);
  assert.equal(profile.firstBookedAt?.getTime(), profile.lastBookedAt?.getTime());
  // Exibição guarda o que a pessoa digitou, não o normalizado.
  assert.equal(profile.displayPhone, "11999998888");
  assert.equal(profile.displayEmail, "Davi@Exemplo.TEST");

  const booking = await testPrisma.booking.findFirstOrThrow();
  assert.equal(booking.profileId, profile.id);
  // O retrato imutável continua sendo o que foi digitado na hora.
  assert.equal(booking.clientEmail, "Davi@Exemplo.TEST");
  assert.equal(booking.clientPhone, "11999998888");
});

test("o mesmo convidado voltando reusa a identidade e soma no prontuário", async () => {
  const { business, service, slots } = await seedBookableBusiness("crm-voltando", {
    startTimes: ["09:00", "09:30"],
  });

  const primeira = await book(
    business.slug,
    payload(slots[0].id, service.id, "Davi", { clientEmail: "davi@exemplo.test" }),
  );
  // Segunda reserva com o telefone digitado de OUTRO jeito: mesma pessoa.
  const segunda = await book(
    business.slug,
    payload(slots[1].id, service.id, "Davi", {
      clientEmail: "davi@exemplo.test",
      clientPhone: "(11) 99999-8888",
    }),
  );
  assert.equal(primeira.statusCode, 201);
  assert.equal(segunda.statusCode, 201);

  assert.equal(await testPrisma.customer.count(), 1, "digitar o telefone diferente não duplica");
  assert.equal(await testPrisma.customerProfile.count(), 1);

  const profile = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(profile.bookingsCount, 2);
  assert.equal(profile.totalSpent.toString(), service.price.mul(2).toString());
});

// A promessa central do produto. Sem esta asserção, uma "otimização" que
// reusasse identidade por e-mail digitado ligaria os dois negócios.
test("mesmo e-mail e telefone em outro negócio: identidades separadas", async () => {
  const old = await seedBookableBusiness("crm-old-brothers");
  const prime = await seedBookableBusiness("crm-barber-prime");

  const aqui = await book(
    old.business.slug,
    payload(old.slots[0].id, old.service.id, "Davi", { clientEmail: "davi@exemplo.test" }),
  );
  const ali = await book(
    prime.business.slug,
    payload(prime.slots[0].id, prime.service.id, "Davi", { clientEmail: "davi@exemplo.test" }),
  );
  assert.equal(aqui.statusCode, 201);
  assert.equal(ali.statusCode, 201);

  assert.equal(await testPrisma.customer.count(), 2, "e-mail não verificado não atravessa negócio");

  // O segundo negócio chegou depois: o canal já estava reivindicado, então a
  // identidade dele nasce sem canal. O valor NÃO se perde — está no prontuário
  // e no retrato da reserva, que é o que o negócio lê.
  const semCanal = await testPrisma.customer.findFirstOrThrow({
    where: { email: null },
    include: { profiles: true },
  });
  assert.equal(semCanal.phoneE164, null);
  assert.equal(semCanal.profiles.length, 1);
  assert.equal(semCanal.profiles[0].displayEmail, "davi@exemplo.test");
  assert.equal(semCanal.profiles[0].displayPhone, "11999998888");

  // Cada prontuário conta só o que aconteceu na sua casa.
  const profiles = await testPrisma.customerProfile.findMany();
  assert.equal(profiles.length, 2);
  assert.ok(profiles.every((profile) => profile.bookingsCount === 1));
  assert.notEqual(profiles[0].customerId, profiles[1].customerId);
});

// O único vínculo que atravessa negócios, e a razão de ele ser seguro.
test("e-mail VERIFICADO atravessa negócios e ganha prontuário novo, zerado", async () => {
  const old = await seedBookableBusiness("crm-verificado-a");
  const prime = await seedBookableBusiness("crm-verificado-b");

  const verificado = await testPrisma.customer.create({
    data: {
      name: "Davi",
      email: "davi@verificado.test",
      emailVerifiedAt: new Date(),
      state: CustomerIdentityState.ACTIVE,
      passwordHash: "hash-irrelevante",
    },
  });

  await book(
    old.business.slug,
    payload(old.slots[0].id, old.service.id, "Davi", { clientEmail: "davi@verificado.test" }),
  );
  await book(
    prime.business.slug,
    payload(prime.slots[0].id, prime.service.id, "Davi", { clientEmail: "davi@verificado.test" }),
  );

  assert.equal(await testPrisma.customer.count(), 1, "uma pessoa, uma identidade");

  const profiles = await testPrisma.customerProfile.findMany({ orderBy: { businessId: "asc" } });
  assert.equal(profiles.length, 2, "um prontuário por negócio");
  assert.ok(profiles.every((profile) => profile.customerId === verificado.id));
  assert.ok(
    profiles.every((profile) => profile.bookingsCount === 1),
    "o histórico não atravessa: cada negócio vê uma reserva, a dele",
  );
});

// §11.1 pela porta da frente. Este é o teste que impede o sequestro de conta.
test("conta ACTIVE com e-mail NÃO verificado não recebe a reserva de ninguém", async () => {
  const { business, service, slots } = await seedBookableBusiness("crm-nao-verificado");

  // O cenário do atacante: registrou o e-mail da vítima e nunca confirmou.
  const atacante = await testPrisma.customer.create({
    data: {
      name: "Atacante",
      email: "vitima@exemplo.test",
      emailVerifiedAt: null,
      state: CustomerIdentityState.ACTIVE,
      passwordHash: "hash-do-atacante",
    },
  });

  // A vítima reserva com o próprio e-mail.
  const response = await book(
    business.slug,
    payload(slots[0].id, service.id, "Vítima", { clientEmail: "vitima@exemplo.test" }),
  );
  assert.equal(response.statusCode, 201, "a reserva não pode falhar por causa disso");

  const profiles = await testPrisma.customerProfile.findMany();
  assert.equal(profiles.length, 1);
  assert.notEqual(
    profiles[0].customerId,
    atacante.id,
    "a reserva da vítima NÃO pode pertencer à conta do atacante",
  );

  const vitima = await testPrisma.customer.findUniqueOrThrow({
    where: { id: profiles[0].customerId },
  });
  assert.equal(vitima.state, CustomerIdentityState.PROVISIONAL);
  assert.equal(vitima.email, null, "o canal estava reivindicado: nasce sem ele");
  assert.equal(vitima.phoneE164, "+5511999998888");
  // E o atacante continua sem prontuário nenhum.
  assert.equal(await testPrisma.customerProfile.count({ where: { customerId: atacante.id } }), 0);
});

test("duas reservas simultâneas do mesmo cliente criam UMA identidade e UM prontuário", async () => {
  const { business, service, slots } = await seedBookableBusiness("crm-corrida-mesma", {
    startTimes: ["09:00", "09:30"],
  });

  const [primeira, segunda] = await Promise.all([
    book(
      business.slug,
      payload(slots[0].id, service.id, "Davi", { clientEmail: "davi@corrida.test" }),
    ),
    book(
      business.slug,
      payload(slots[1].id, service.id, "Davi", { clientEmail: "davi@corrida.test" }),
    ),
  ]);

  assert.deepEqual([primeira.statusCode, segunda.statusCode], [201, 201]);
  assert.equal(await testPrisma.customer.count(), 1);
  assert.equal(await testPrisma.customerProfile.count(), 1);

  const profile = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(profile.bookingsCount, 2, "os dois bumps têm que contar");
  assert.equal(profile.totalSpent.toString(), service.price.mul(2).toString());

  const bookings = await testPrisma.booking.findMany();
  assert.equal(bookings.length, 2);
  assert.ok(bookings.every((booking) => booking.profileId === profile.id));
});

test("reservas simultâneas com o mesmo telefone em negócios diferentes não se fundem", async () => {
  const a = await seedBookableBusiness("crm-corrida-a");
  const b = await seedBookableBusiness("crm-corrida-b");

  const [primeira, segunda] = await Promise.all([
    book(a.business.slug, payload(a.slots[0].id, a.service.id, "Davi")),
    book(b.business.slug, payload(b.slots[0].id, b.service.id, "Davi")),
  ]);

  assert.deepEqual([primeira.statusCode, segunda.statusCode], [201, 201]);
  assert.equal(await testPrisma.customer.count(), 2, "na dúvida, duas identidades separadas");
  assert.equal(await testPrisma.customerProfile.count(), 2);

  // Exatamente uma ficou com o canal; a outra nasceu isolada.
  const comCanal = await testPrisma.customer.count({ where: { phoneE164: { not: null } } });
  assert.equal(comCanal, 1);

  const bookings = await testPrisma.booking.findMany();
  assert.equal(bookings.length, 2);
  assert.ok(
    bookings.every((booking) => booking.profileId !== null),
    "as duas reservas ficam com prontuário mesmo assim",
  );
});

// O trabalho de identidade acontece ANTES do claim do horário. Este teste é o
// que prova que ele não deixa lixo quando o claim perde: a transação inteira
// volta atrás.
test("perdedor da corrida por horário não deixa identidade nem prontuário para trás", async () => {
  const { business, service, slots } = await seedBookableBusiness("crm-claim-perdido");

  const [primeira, segunda] = await Promise.all([
    book(business.slug, payload(slots[0].id, service.id, "Cliente A", { clientEmail: "a@x.test" })),
    book(business.slug, payload(slots[0].id, service.id, "Cliente B", { clientEmail: "b@x.test" })),
  ]);

  assert.deepEqual([primeira.statusCode, segunda.statusCode].sort(), [201, 409]);
  assert.equal(await testPrisma.booking.count(), 1);
  assert.equal(await testPrisma.customer.count(), 1, "só o vencedor deixa identidade");
  assert.equal(await testPrisma.customerProfile.count(), 1);

  const profile = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(profile.bookingsCount, 1, "o agregado não conta a reserva que não existiu");
});

test("telefone impossível de normalizar e sem e-mail ainda ganha prontuário", async () => {
  const { business, service, slots } = await seedBookableBusiness("crm-sem-canal");

  // 9 dígitos: passa o `minLength: 8` do schema da rota, mas não é DDD + número
  // que o normalizador reconheça. O schema barra lixo evidente; este caso é o
  // que passa por ele e ainda assim não vira canal.
  const response = await book(
    business.slug,
    payload(slots[0].id, service.id, "Cliente de balcão", { clientPhone: "999998888" }),
  );
  assert.equal(response.statusCode, 201);

  const customer = await testPrisma.customer.findFirstOrThrow();
  assert.equal(customer.email, null);
  assert.equal(customer.phoneE164, null, "não grava meio normalizado");

  const profile = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(profile.displayPhone, "999998888", "o que a pessoa digitou não se perde");
  assert.equal(profile.bookingsCount, 1);

  const booking = await testPrisma.booking.findFirstOrThrow();
  assert.equal(booking.profileId, profile.id);
  assert.equal(booking.clientPhone, "999998888");
});

test("reserva pelo balcão registra a origem STAFF no prontuário", async () => {
  const { business, employee, service, slots } = await seedBookableBusiness("crm-balcao");
  const token = app.jwt.sign({ sub: employee.id, role: Role.EMPLOYEE, businessId: business.id });

  const response = await app.inject({
    method: "POST",
    url: "/bookings",
    headers: { authorization: `Bearer ${token}` },
    payload: payload(slots[0].id, service.id, "Cliente do balcão"),
  });
  assert.equal(response.statusCode, 201);

  const profile = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(profile.source, CustomerLinkSource.STAFF);
  assert.equal(profile.bookingsCount, 1);
});
