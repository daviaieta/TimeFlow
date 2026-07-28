// A ordem destes dois imports é o teste: testDb aponta o Prisma para o
// schema de teste e disableBilling desliga a cobrança, ambos antes de
// `../app` avaliar `config/env`.
import "./testDb";
import "./disableBilling";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { SubscriptionStatus } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { env } from "../config/env";
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

function tokenFor(user: { id: number; role: string; businessId: number }) {
  return app.jwt.sign({
    sub: user.id,
    role: user.role as never,
    businessId: user.businessId,
  });
}

// Se esta falhar, todo o resto do arquivo estaria testando a configuração
// errada e passando por acidente.
test("a flag chegou desligada em env", () => {
  assert.equal(env.billingEnabled, false);
});

test("negócio PENDING usa o painel durante a cortesia", async () => {
  const { admin, business } = await seedBookableBusiness("cortesia", {
    subscriptionStatus: SubscriptionStatus.PENDING,
  });

  const response = await app.inject({
    method: "GET",
    url: "/services",
    headers: { authorization: `Bearer ${tokenFor({ ...admin, businessId: business.id })}` },
  });

  assert.equal(response.statusCode, 200);
});

test("negócio PENDING também reserva pelo painel durante a cortesia", async () => {
  const { employee, business, service, slots } = await seedBookableBusiness("cortesia-reserva", {
    subscriptionStatus: SubscriptionStatus.PENDING,
  });

  const response = await app.inject({
    method: "POST",
    url: "/bookings",
    headers: { authorization: `Bearer ${tokenFor({ ...employee, businessId: business.id })}` },
    payload: {
      availabilityId: slots[0].id,
      serviceId: service.id,
      clientName: "Cliente",
      clientPhone: "11999998888",
    },
  });

  assert.equal(response.statusCode, 201);
});

test("as rotas de cobrança não sobem com a flag desligada", async () => {
  const { admin, business } = await seedBookableBusiness("sem-checkout", {
    subscriptionStatus: SubscriptionStatus.PENDING,
  });

  const response = await app.inject({
    method: "POST",
    url: `/businesses/${business.id}/checkout-session`,
    headers: { authorization: `Bearer ${tokenFor({ ...admin, businessId: business.id })}` },
    payload: { planName: "ESSENCIAL", cpfCnpj: "12345678909" },
  });

  assert.equal(response.statusCode, 404);
});

test("o webhook do Stripe também some", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/webhooks/stripe",
    payload: {},
  });

  assert.equal(response.statusCode, 404);
});

test("/auth/me conta ao front que a cobrança está desligada", async () => {
  const { admin, business } = await seedBookableBusiness("me-billing", {
    subscriptionStatus: SubscriptionStatus.PENDING,
  });

  const response = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { authorization: `Bearer ${tokenFor({ ...admin, businessId: business.id })}` },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().billingEnabled, false);
});
