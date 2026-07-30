// Precisa ser o primeiro import: aponta o PrismaClient para o schema de
// teste antes que qualquer coisa toque em `lib/prisma`. Ver testDb.ts.
import "./testDb";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { CustomerLinkSource, CustomerMergeActor, Prisma } from "@prisma/client";
import { createBusiness, createService } from "./factories";
import { ensureTestSchema, resetDatabase, testPrisma } from "./testDb";

// Fase 1 do CRM: só existe schema, nenhuma rota. O que dá para trancar neste
// ponto são exatamente as garantias que moram NO BANCO — e são justamente as
// que não podem depender de a camada de service lembrar de conferir.

before(async () => {
  await ensureTestSchema();
});

after(async () => {
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
});

async function createCustomer(name: string, email?: string) {
  return testPrisma.customer.create({ data: { name, email } });
}

async function createProfile(customerId: number, businessId: number, displayName: string) {
  return testPrisma.customerProfile.create({
    data: {
      customerId,
      businessId,
      displayName,
      source: CustomerLinkSource.PUBLIC_BOOKING,
    },
  });
}

// A invariante anti-duplicata do documento (§2.3): um prontuário por pessoa
// por negócio. É do banco de propósito — uma checagem de service seria
// esquecida por algum caminho de criação futuro, e é ela também que absorve a
// corrida de duas primeiras reservas simultâneas do mesmo cliente.
test("um cliente não pode ter dois prontuários no mesmo negócio", async () => {
  const business = await createBusiness({ slug: "duplicata" });
  const customer = await createCustomer("Davi");

  await createProfile(customer.id, business.id, "Davi");

  await assert.rejects(
    () => createProfile(customer.id, business.id, "Davi de novo"),
    (error: unknown) => {
      assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
      assert.equal(error.code, "P2002");
      return true;
    },
  );

  assert.equal(await testPrisma.customerProfile.count(), 1);
});

// O outro lado da mesma invariante: a mesma pessoa em negócios diferentes é
// normal, é o produto. Sem esta asserção, alguém "corrige" o unique para
// customerId só e a promessa central quebra silenciosamente.
test("o mesmo cliente tem um prontuário por negócio, independentes", async () => {
  const oldBrothers = await createBusiness({ slug: "old-brothers" });
  const barberPrime = await createBusiness({ slug: "barber-prime" });
  const customer = await createCustomer("Davi", "davi@exemplo.test");

  const aqui = await createProfile(customer.id, oldBrothers.id, "Davi");
  const ali = await createProfile(customer.id, barberPrime.id, "Davi");

  assert.notEqual(aqui.id, ali.id);
  assert.notEqual(aqui.publicId, ali.publicId);

  // Cada prontuário nasce zerado: nada do histórico de um negócio atravessa
  // para o outro nem mesmo como contador.
  assert.equal(ali.bookingsCount, 0);
  assert.equal(ali.loyaltyPoints, 0);
  assert.equal(ali.totalSpent.toString(), "0");
  assert.equal(ali.lastBookedAt, null);
});

// publicId é o que a API de negócio expõe, no lugar do Customer.id global: se
// dois negócios recebessem o id global, poderiam comparar listas e descobrir
// clientes em comum. Default no banco (gen_random_uuid) e não no cliente
// Prisma, para que o backfill da fase 3 possa ser SQL puro se o volume pedir.
test("prontuário e cliente nascem com publicId do banco, sem o código pedir", async () => {
  const business = await createBusiness({ slug: "public-id" });
  const customer = await createCustomer("Davi");
  const profile = await createProfile(customer.id, business.id, "Davi");

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  assert.match(customer.publicId, uuid);
  assert.match(profile.publicId, uuid);

  // Inserção por SQL puro também recebe o publicId: é isso que a default no
  // banco compra, e o backfill vai depender disso.
  const [inserted] = await testPrisma.$queryRaw<{ publicId: string }[]>`
    INSERT INTO "Customer" ("name", "updatedAt") VALUES ('Via SQL', now())
    RETURNING "publicId"
  `;
  assert.match(inserted.publicId, uuid);
});

// §11.10: fundir identidades é a única operação destrutiva do CRM, e este log
// é o que a torna reversível à mão. Combinado de camada não basta — o banco
// recusa.
test("CustomerMergeLog recusa UPDATE", async () => {
  const business = await createBusiness({ slug: "merge-update" });
  const winner = await createCustomer("Davi", "davi@merge.test");
  const loser = await createCustomer("Davi (duplicata)");

  const log = await testPrisma.customerMergeLog.create({
    data: {
      winnerId: winner.id,
      loserId: loser.id,
      businessId: business.id,
      movedBookings: 4,
      actor: CustomerMergeActor.CUSTOMER,
    },
  });

  await assert.rejects(
    () =>
      testPrisma.customerMergeLog.update({
        where: { id: log.id },
        data: { movedBookings: 0 },
      }),
    /somente de acrescimo/,
  );

  const survivor = await testPrisma.customerMergeLog.findUniqueOrThrow({ where: { id: log.id } });
  assert.equal(survivor.movedBookings, 4, "a contagem original tem que sobreviver à tentativa");
});

test("CustomerMergeLog recusa DELETE", async () => {
  const business = await createBusiness({ slug: "merge-delete" });
  const winner = await createCustomer("Davi", "davi@delete.test");
  const loser = await createCustomer("Davi (duplicata)");

  const log = await testPrisma.customerMergeLog.create({
    data: {
      winnerId: winner.id,
      loserId: loser.id,
      businessId: business.id,
      profilesCollapsed: true,
      actor: CustomerMergeActor.STAFF,
    },
  });

  await assert.rejects(
    () => testPrisma.customerMergeLog.delete({ where: { id: log.id } }),
    /somente de acrescimo/,
  );

  assert.equal(await testPrisma.customerMergeLog.count(), 1);
});

// A chave de idempotência é por negócio, e os NULLs precisam continuar
// distintos: toda reserva que já existe tem NULL ali, e um unique que
// colidisse em NULL teria quebrado a migration em cima do banco de produção.
test("idempotencyKey da reserva é única por negócio, e vários NULLs convivem", async () => {
  const business = await createBusiness({ slug: "idempotencia" });
  const outro = await createBusiness({ slug: "idempotencia-vizinho" });
  const service = await createService(business.id);
  const serviceDoOutro = await createService(outro.id);

  const base = {
    clientName: "Cliente",
    clientPhone: "11999998888",
    priceAtBooking: new Prisma.Decimal(50),
  };

  await testPrisma.booking.create({
    data: { ...base, serviceId: service.id, businessId: business.id, idempotencyKey: "abc" },
  });

  // Mesma chave, mesmo negócio: recusada.
  await assert.rejects(
    () =>
      testPrisma.booking.create({
        data: { ...base, serviceId: service.id, businessId: business.id, idempotencyKey: "abc" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
      assert.equal(error.code, "P2002");
      return true;
    },
  );

  // Mesma chave, OUTRO negócio: aceita. A chave é do tenant, não global —
  // senão um negócio conseguiria bloquear a reserva de outro só adivinhando
  // chaves.
  await testPrisma.booking.create({
    data: {
      ...base,
      serviceId: serviceDoOutro.id,
      businessId: outro.id,
      idempotencyKey: "abc",
    },
  });

  // Sem chave: quantas quiser. É o caso de todas as reservas anteriores ao CRM.
  await testPrisma.booking.create({
    data: { ...base, serviceId: service.id, businessId: business.id },
  });
  await testPrisma.booking.create({
    data: { ...base, serviceId: service.id, businessId: business.id },
  });

  assert.equal(await testPrisma.booking.count(), 4);
});

// A nota é escopada por tenant por construção: o businessId mora nela, não é
// inferido pelo prontuário. Este teste tranca a coluna contra um "dá para
// derivar, então remove" futuro.
test("nota e ponto de fidelidade carregam o próprio businessId", async () => {
  const business = await createBusiness({ slug: "escopo-nota" });
  const customer = await createCustomer("Davi");
  const profile = await createProfile(customer.id, business.id, "Davi");

  const note = await testPrisma.customerNote.create({
    data: { profileId: profile.id, businessId: business.id, body: "Alérgico a amônia." },
  });
  assert.equal(note.businessId, business.id);
  // Nota nunca nasce visível ao cliente: salão e consultório escrevem
  // informação de saúde aqui.
  assert.equal(note.visibleToCustomer, false);

  const entry = await testPrisma.loyaltyEntry.create({
    data: { profileId: profile.id, businessId: business.id, kind: "EARN", points: 50 },
  });
  assert.equal(entry.businessId, business.id);
});
