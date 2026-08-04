// Fase 4, passo 6: a reserva pelo painel pode FIXAR o prontuário
// (`profilePublicId`), em vez de deixar o telefone digitado decidir quem é o
// cliente. É o que o autocomplete do balcão manda.
//
// O que esta suíte tranca:
// 1. fixar liga a reserva ÀQUELE prontuário, mesmo quando o contato digitado
//    apontaria para outra identidade — a atendente já disse quem é;
// 2. fixar não cria identidade nova nem prontuário novo;
// 3. os agregados sobem no prontuário fixado;
// 4. Booking.client* continua sendo o retrato do que foi digitado (§15.5): o
//    cadastro não reescreve a reserva e a reserva não reescreve o cadastro;
// 5. publicId de outro negócio é 404 (§11.4) e não consome o horário;
// 6. publicId que não é uuid é 400, antes do controller.
import "./testDb";
import "./enableCrm";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { seedBookableBusiness } from "./factories";
import { ensureTestSchema, resetDatabase, testPrisma } from "./testDb";

let app: FastifyInstance;

before(async () => {
  await ensureTestSchema();
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

function tokenFor(userId: number, role: Role, businessId: number) {
  return app.jwt.sign({ sub: userId, role, businessId });
}

function post(path: string, bearer: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: path,
    headers: { authorization: `Bearer ${bearer}` },
    payload,
  });
}

// Cadastra um cliente pelo balcão e devolve o publicId — a mesma porta que o
// autocomplete usa para achá-lo depois.
async function registerCustomer(
  bearer: string,
  fields: { displayName: string; displayPhone?: string; displayEmail?: string },
): Promise<string> {
  const res = await post("/customers", bearer, fields);
  assert.equal(res.statusCode, 201);
  return res.json().profile.publicId as string;
}

test("reserva com prontuário fixado liga ao prontuário escolhido", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("fix-basico");
  const token = tokenFor(admin.id, Role.ADMIN, business.id);

  const publicId = await registerCustomer(token, {
    displayName: "Davi Aieta",
    displayPhone: "(11) 99999-8888",
  });

  const res = await post("/bookings", token, {
    availabilityId: slots[0].id,
    serviceId: service.id,
    clientName: "Davi",
    clientPhone: "11999998888",
    profilePublicId: publicId,
  });
  assert.equal(res.statusCode, 201);

  const booking = await testPrisma.booking.findFirstOrThrow();
  const profile = await testPrisma.customerProfile.findFirstOrThrow({ where: { publicId } });
  assert.equal(booking.profileId, profile.id);

  // Nada de novo foi inventado: um prontuário e uma identidade, os do cadastro.
  assert.equal(await testPrisma.customerProfile.count(), 1);
  assert.equal(await testPrisma.customer.count(), 1);
});

// O caso que dá sentido ao campo. Sem ele, um telefone diferente do cadastrado
// resolveria por canal e abriria um SEGUNDO prontuário para a mesma pessoa —
// exatamente a duplicata que o autocomplete existe para evitar.
test("prontuário fixado vence o contato digitado", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("fix-vence");
  const token = tokenFor(admin.id, Role.ADMIN, business.id);

  const publicId = await registerCustomer(token, {
    displayName: "Davi Aieta",
    displayPhone: "11999998888",
  });

  const res = await post("/bookings", token, {
    availabilityId: slots[0].id,
    serviceId: service.id,
    clientName: "Davi (celular novo)",
    clientPhone: "11912345678",
    profilePublicId: publicId,
  });
  assert.equal(res.statusCode, 201);

  assert.equal(await testPrisma.customerProfile.count(), 1, "não duplica prontuário");
  assert.equal(await testPrisma.customer.count(), 1, "não cria identidade nova");

  const booking = await testPrisma.booking.findFirstOrThrow();
  const profile = await testPrisma.customerProfile.findFirstOrThrow({ where: { publicId } });
  assert.equal(booking.profileId, profile.id);

  // §15.5: a reserva guarda o que foi digitado no ato; o cadastro guarda o que
  // o negócio sabe. Um não reescreve o outro.
  assert.equal(booking.clientName, "Davi (celular novo)");
  assert.equal(booking.clientPhone, "11912345678");
  assert.equal(profile.displayName, "Davi Aieta");
  assert.equal(profile.displayPhone, "11999998888");

  // O canal digitado não vira canal da identidade: quem resolve identidade é o
  // §4.1, e fixar prontuário passa por fora dele de propósito.
  const customer = await testPrisma.customer.findUniqueOrThrow({
    where: { id: profile.customerId },
  });
  assert.equal(customer.phoneE164, "+5511999998888");
});

test("agregados sobem no prontuário fixado", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("fix-agregados");
  const token = tokenFor(admin.id, Role.ADMIN, business.id);

  const publicId = await registerCustomer(token, {
    displayName: "Davi",
    displayPhone: "11999998888",
  });

  const before = await testPrisma.customerProfile.findFirstOrThrow({ where: { publicId } });
  assert.equal(before.bookingsCount, 0);
  assert.equal(before.totalSpent.toString(), "0");
  assert.equal(before.firstBookedAt, null);

  const res = await post("/bookings", token, {
    availabilityId: slots[0].id,
    serviceId: service.id,
    clientName: "Davi",
    clientPhone: "11999998888",
    profilePublicId: publicId,
  });
  assert.equal(res.statusCode, 201);

  const after = await testPrisma.customerProfile.findFirstOrThrow({ where: { publicId } });
  assert.equal(after.bookingsCount, 1);
  assert.equal(after.totalSpent.toString(), service.price.toString());
  assert.notEqual(after.firstBookedAt, null);
  assert.notEqual(after.lastBookedAt, null);

  // Sem ciclo de vida de reserva não há conclusão para contar (§17 decisão 7).
  assert.equal(after.completedCount, 0);
  assert.equal(after.noShowCount, 0);
});

test("prontuário de outro negócio é 404 e não consome o horário", async () => {
  const alheio = await seedBookableBusiness("fix-alheio");
  const meu = await seedBookableBusiness("fix-meu");

  const publicId = await registerCustomer(
    tokenFor(alheio.admin.id, Role.ADMIN, alheio.business.id),
    { displayName: "Cliente do vizinho", displayPhone: "11988887777" },
  );

  const res = await post("/bookings", tokenFor(meu.admin.id, Role.ADMIN, meu.business.id), {
    availabilityId: meu.slots[0].id,
    serviceId: meu.service.id,
    clientName: "Davi",
    clientPhone: "11999998888",
    profilePublicId: publicId,
  });

  // 404 e nunca 403: um 403 confirmaria que o cadastro existe em algum lugar.
  assert.equal(res.statusCode, 404);

  // A validação acontece antes de qualquer escrita — o horário continua livre.
  const slot = await testPrisma.availability.findUniqueOrThrow({
    where: { id: meu.slots[0].id },
  });
  assert.equal(slot.isBooked, false);
  assert.equal(await testPrisma.booking.count(), 0);

  // E o prontuário do vizinho não foi tocado.
  const vizinho = await testPrisma.customerProfile.findFirstOrThrow({ where: { publicId } });
  assert.equal(vizinho.bookingsCount, 0);
});

test("prontuário inexistente é 404", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("fix-fantasma");

  const res = await post("/bookings", tokenFor(admin.id, Role.ADMIN, business.id), {
    availabilityId: slots[0].id,
    serviceId: service.id,
    clientName: "Davi",
    clientPhone: "11999998888",
    profilePublicId: "3f1c2b4a-5d6e-4f70-8912-abcdef012345",
  });

  assert.equal(res.statusCode, 404);
  assert.equal(await testPrisma.booking.count(), 0);
});

test("publicId que não é uuid para no schema da rota", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("fix-schema");

  const res = await post("/bookings", tokenFor(admin.id, Role.ADMIN, business.id), {
    availabilityId: slots[0].id,
    serviceId: service.id,
    clientName: "Davi",
    clientPhone: "11999998888",
    profilePublicId: "7",
  });

  assert.equal(res.statusCode, 400);
});

// -----------------------------------------------------------------------------
// GET /availabilities — o que a agenda precisa para desenhar o chip
// -----------------------------------------------------------------------------

test("a agenda devolve o prontuário junto da reserva", async () => {
  const { business, admin, employee, service, slots } =
    await seedBookableBusiness("fix-agenda");
  const token = tokenFor(admin.id, Role.ADMIN, business.id);

  const publicId = await registerCustomer(token, {
    displayName: "Davi Aieta",
    displayPhone: "11999998888",
  });

  await post("/bookings", token, {
    availabilityId: slots[0].id,
    serviceId: service.id,
    clientName: "Davi",
    clientPhone: "11999998888",
    profilePublicId: publicId,
  });

  const day = slots[0].date.toISOString().slice(0, 10);
  const res = await app.inject({
    method: "GET",
    url: `/availabilities?employeeId=${employee.id}&date=${day}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);

  const booked = res
    .json()
    .availabilities.find((slot: { booking: unknown }) => slot.booking !== null);
  assert.ok(booked, "o slot reservado tem que voltar com a reserva");

  // O chip precisa dos dois: o handle para navegar e o nome do CADASTRO, que
  // pode divergir do nome digitado na reserva.
  assert.equal(booked.booking.profile.publicId, publicId);
  assert.equal(booked.booking.profile.displayName, "Davi Aieta");
  assert.equal(booked.booking.clientName, "Davi");

  // O id interno do prontuário não acompanha o passeio.
  assert.equal(booked.booking.profile.id, undefined);
});

test("reserva sem prontuário volta com profile null na agenda", async () => {
  const { business, admin, employee } = await seedBookableBusiness("fix-agenda-vazia");
  const token = tokenFor(admin.id, Role.ADMIN, business.id);

  const res = await app.inject({
    method: "GET",
    url: `/availabilities?employeeId=${employee.id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);

  // Slot livre não tem reserva nenhuma — o que a agenda não pode receber é um
  // campo ausente que quebre a leitura de `booking.profile`.
  for (const slot of res.json().availabilities) {
    assert.equal(slot.booking, null);
  }
});

// Sem o campo, o caminho é o de sempre: identidade resolvida pelo contato.
// Este teste existe para provar que fixar é ADITIVO — o balcão que não usa o
// autocomplete continua funcionando exatamente como antes.
test("reserva sem prontuário fixado continua resolvendo por canal", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("fix-ausente");

  const res = await post("/bookings", tokenFor(admin.id, Role.ADMIN, business.id), {
    availabilityId: slots[0].id,
    serviceId: service.id,
    clientName: "Davi",
    clientPhone: "11999998888",
  });
  assert.equal(res.statusCode, 201);

  const profile = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(profile.bookingsCount, 1);
  const booking = await testPrisma.booking.findFirstOrThrow();
  assert.equal(booking.profileId, profile.id);
});
