// Precisa ser o primeiro import: aponta o PrismaClient para o schema de
// teste antes que `../app` construa o singleton. Ver comentário em testDb.ts.
import "./testDb";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { SubscriptionStatus } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { seedBookableBusiness } from "./factories";
import { ensureTestSchema, resetDatabase, testPrisma } from "./testDb";

// Cobrança LIGADA (default). O par deste arquivo é
// billingDisabled.integration.test.ts, que roda o mesmo cenário com
// BILLING_ENABLED=false — juntos, provam que a flag é o que decide, e não
// alguma outra coisa que mudou junto.
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

function tokenFor(app: FastifyInstance, user: { id: number; role: string; businessId: number }) {
  return app.jwt.sign({
    sub: user.id,
    role: user.role as never,
    businessId: user.businessId,
  });
}

test("negócio sem assinatura não entra nas rotas do painel", async () => {
  const { admin, business } = await seedBookableBusiness("sem-assinatura", {
    subscriptionStatus: SubscriptionStatus.PENDING,
  });

  const response = await app.inject({
    method: "GET",
    url: "/services",
    headers: {
      authorization: `Bearer ${tokenFor(app, { ...admin, businessId: business.id })}`,
    },
  });

  assert.equal(response.statusCode, 402);
});

test("negócio com assinatura ativa entra normalmente", async () => {
  const { admin, business } = await seedBookableBusiness("com-assinatura");

  const response = await app.inject({
    method: "GET",
    url: "/services",
    headers: {
      authorization: `Bearer ${tokenFor(app, { ...admin, businessId: business.id })}`,
    },
  });

  assert.equal(response.statusCode, 200);
});

test("a rota de checkout existe com a cobrança ligada", async () => {
  const { admin, business } = await seedBookableBusiness("checkout-ligado", {
    subscriptionStatus: SubscriptionStatus.PENDING,
  });

  const response = await app.inject({
    method: "POST",
    url: `/businesses/${business.id}/checkout-session`,
    headers: {
      authorization: `Bearer ${tokenFor(app, { ...admin, businessId: business.id })}`,
    },
    payload: { planName: "ESSENCIAL", cpfCnpj: "12345678909" },
  });

  // Sem chave de verdade a chamada ao Stripe falha; o que importa aqui é que
  // a rota está registrada, e não um 404 de rota inexistente.
  assert.notEqual(response.statusCode, 404);
});
