// Fase 4, passo 4: fidelidade. A ledger de LoyaltyEntry é lida por qualquer
// staff e o ADJUST é exclusivo de ADMIN. EARN/REDEEM/EXPIRE não têm endpoint
// — entram pelo ciclo de vida da reserva quando ele existir (§17 decisão 7c).
//
// Invariantes testados:
// 1. GET lista entradas com keyset e nextCursor
// 2. POST ADJUST por admin cria entrada e atualiza saldo
// 3. POST ADJUST por employee é recusado (403)
// 4. idempotencyKey bloqueia duplicata
// 5. customer de outro negócio: 404 em GET e POST
// 6. publicId inválido: 400
// 7. ADJUST sem motivo ou pontos zero: 400

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

function get(path: string, bearer: string) {
  return app.inject({
    method: "GET",
    url: path,
    headers: { authorization: `Bearer ${bearer}` },
  });
}

function post(path: string, bearer: string, payload: unknown) {
  return app.inject({
    method: "POST",
    url: path,
    headers: { authorization: `Bearer ${bearer}` },
    payload,
  });
}

async function book(
  slug: string,
  clientName: string,
  availabilityId: number,
  serviceId: number,
  phone = "11999998888",
  email?: string,
) {
  const payload: Record<string, unknown> = { availabilityId, serviceId, clientName, clientPhone: phone };
  if (email) payload.clientEmail = email;
  return app.inject({ method: "POST", url: `/public/businesses/${slug}/bookings`, payload });
}

test("lista de loyalty vazia", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("loyalty-vazio");
  await book(business.slug, "Davi", slots[0].id, service.id);
  const profile = await testPrisma.customerProfile.findFirstOrThrow();

  const res = await get(
    `/customers/${profile.publicId}/loyalty`,
    tokenFor(admin.id, Role.ADMIN, business.id),
  );
  assert.equal(res.statusCode, 200);

  const body = res.json();
  assert.deepEqual(body.entries, []);
  assert.equal(body.nextCursor, null);
});

test("ADJUST cria entrada e atualiza saldo", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("loyalty-ajuste");
  await book(business.slug, "Davi", slots[0].id, service.id);
  const profile = await testPrisma.customerProfile.findFirstOrThrow();

  // Saldo começa zerado.
  const freshProfile = await testPrisma.customerProfile.findUniqueOrThrow({ where: { id: profile.id } });
  assert.equal(freshProfile.loyaltyPoints, 0);

  const res = await post(
    `/customers/${profile.publicId}/loyalty`,
    tokenFor(admin.id, Role.ADMIN, business.id),
    { points: 50, reason: "bônus de boas-vindas" },
  );
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.ok(!body.alreadyApplied);
  assert.ok(body.id > 0);

  // Saldo atualizado.
  const updated = await testPrisma.customerProfile.findUniqueOrThrow({ where: { id: profile.id } });
  assert.equal(updated.loyaltyPoints, 50);
});

test("EMPLOYEE tem 403 no ADjUST", async () => {
  const { business, employee, service, slots } = await seedBookableBusiness("loyalty-employee");
  await book(business.slug, "Davi", slots[0].id, service.id);
  const profile = await testPrisma.customerProfile.findFirstOrThrow();

  const res = await post(
    `/customers/${profile.publicId}/loyalty`,
    tokenFor(employee.id, Role.EMPLOYEE, business.id),
    { points: 10, reason: "tentativa de funcionário" },
  );
  assert.equal(res.statusCode, 403);
});

test("idempotencyKey bloqueia duplicata", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("loyalty-idempotent");
  await book(business.slug, "Davi", slots[0].id, service.id);
  const profile = await testPrisma.customerProfile.findFirstOrThrow();

  const payload = { points: 25, reason: "correçao manual", idempotencyKey: "dup-key-01" };

  const first = await post(
    `/customers/${profile.publicId}/loyalty`,
    tokenFor(admin.id, Role.ADMIN, business.id),
    payload,
  );
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().alreadyApplied, false);

  // Segunda tentativa com mesma chave.
  const second = await post(
    `/customers/${profile.publicId}/loyalty`,
    tokenFor(admin.id, Role.ADMIN, business.id),
    payload,
  );
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().alreadyApplied, true);

  // Saldo só incrementou uma vez.
  const updated = await testPrisma.customerProfile.findUniqueOrThrow({ where: { id: profile.id } });
  assert.equal(updated.loyaltyPoints, 25);
});

test("publicId de outro negócio retorna 404", async () => {
  const a = await seedBookableBusiness("loyalty-a");
  const b = await seedBookableBusiness("loyalty-b");
  await book(b.business.slug, "Davi", b.slots[0].id, b.service.id);
  const profileB = await testPrisma.customerProfile.findFirstOrThrow();

  const res = await get(
    `/customers/${profileB.publicId}/loyalty`,
    tokenFor(a.admin.id, Role.ADMIN, a.business.id),
  );
  assert.equal(res.statusCode, 404, "publicId de outro tenant é 404");

  const postRes = await post(
    `/customers/${profileB.publicId}/loyalty`,
    tokenFor(a.admin.id, Role.ADMIN, a.business.id),
    { points: 5, reason: "invasão de outro negócio" },
  );
  assert.equal(postRes.statusCode, 404);
});

test("requisição sem autenticação retorna 401", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("loyalty-noauth");
  await book(business.slug, "Davi", slots[0].id, service.id);
  const profile = await testPrisma.customerProfile.findFirstOrThrow();

  const getRes = await app.inject({ method: "GET", url: `/customers/${profile.publicId}/loyalty` });
  assert.equal(getRes.statusCode, 401);

  const postRes = await app.inject({
    method: "POST",
    url: `/customers/${profile.publicId}/loyalty`,
    payload: { points: 1, reason: "não autorizado" },
  });
  assert.equal(postRes.statusCode, 401);
});

test("publicId malformado retorna 400", async () => {
  const { business, admin } = await seedBookableBusiness("loyalty-bad-uuid");
  const bearer = tokenFor(admin.id, Role.ADMIN, business.id);

  const getRes = await get("/customers/nem-uuid/loyalty", bearer);
  assert.equal(getRes.statusCode, 400);

  const postRes = await post(
    "/customers/nem-uuid/loyalty",
    bearer,
    { points: 1, reason: "uuid malformado" },
  );
  assert.equal(postRes.statusCode, 400);
});

test("razão sem motivo mínima rejeitada", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("loyalty-reason");
  await book(business.slug, "Davi", slots[0].id, service.id);
  const profile = await testPrisma.customerProfile.findFirstOrThrow();

  const res = await post(
    `/customers/${profile.publicId}/loyalty`,
    tokenFor(admin.id, Role.ADMIN, business.id),
    { points: 10, reason: "ab" },
  );
  assert.equal(res.statusCode, 400);
});

test("pontos zero rejeitado", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("loyalty-zero");
  await book(business.slug, "Davi", slots[0].id, service.id);
  const profile = await testPrisma.customerProfile.findFirstOrThrow();

  const res = await post(
    `/customers/${profile.publicId}/loyalty`,
    tokenFor(admin.id, Role.ADMIN, business.id),
    { points: 0, reason: "zerar pontos" },
  );
  assert.equal(res.statusCode, 400);
});