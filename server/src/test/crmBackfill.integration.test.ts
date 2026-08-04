// Precisa ser o primeiro import: aponta o PrismaClient para o schema de teste
// antes que `lib/prisma` seja avaliado por qualquer caminho. Ver testDb.ts.
import "./testDb";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { CustomerIdentityState, CustomerLinkSource, Prisma } from "@prisma/client";
import { runCrmBackfill } from "../services/crmBackfillService";
import { createBusiness, createService } from "./factories";
import { ensureTestSchema, resetDatabase, testPrisma } from "./testDb";

// O backfill NÃO depende de CRM_ENABLED: é rotina invocada à mão, não caminho
// de requisição. Este arquivo de propósito não importa enableCrm.

before(async () => {
  await ensureTestSchema();
});

after(async () => {
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
});

// Reserva "histórica": anterior à fase 0, então sem priceAtBooking. É o caso
// que o backfill realmente encontra em produção.
async function historicalBooking(
  businessId: number,
  serviceId: number,
  options: {
    clientName?: string;
    clientPhone?: string;
    clientEmail?: string | null;
    priceAtBooking?: number | null;
    createdAt?: Date;
    profileId?: number;
  } = {},
) {
  return testPrisma.booking.create({
    data: {
      businessId,
      serviceId,
      clientName: options.clientName ?? "Davi",
      clientPhone: options.clientPhone ?? "11999998888",
      clientEmail: options.clientEmail ?? null,
      priceAtBooking:
        options.priceAtBooking === undefined || options.priceAtBooking === null
          ? null
          : new Prisma.Decimal(options.priceAtBooking),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      ...(options.profileId ? { profileId: options.profileId } : {}),
    },
  });
}

async function seedBusinessWithHistory(slug: string) {
  const business = await createBusiness({ slug });
  const service = await createService(business.id, { price: 60 });
  return { business, service };
}

test("simulação não grava nada, mas conta o que faria", async () => {
  const { business, service } = await seedBusinessWithHistory("bf-simulacao");
  await historicalBooking(business.id, service.id, { clientEmail: "davi@exemplo.test" });
  await historicalBooking(business.id, service.id, { clientEmail: "davi@exemplo.test" });

  const report = await runCrmBackfill();

  assert.equal(report.bookingsCandidate, 2);
  assert.equal(report.groups, 1);
  assert.equal(report.profilesCreated, 1);
  assert.equal(report.bookingsLinked, 2);

  // E o banco continua intocado.
  assert.equal(await testPrisma.customer.count(), 0);
  assert.equal(await testPrisma.customerProfile.count(), 0);
  assert.equal(await testPrisma.booking.count({ where: { profileId: { not: null } } }), 0);
});

test("--apply cria identidade provisional, prontuário MIGRATION e agregado estimado", async () => {
  const { business, service } = await seedBusinessWithHistory("bf-aplica");
  const antiga = new Date("2026-05-01T10:00:00.000Z");
  const recente = new Date("2026-06-15T10:00:00.000Z");

  await historicalBooking(business.id, service.id, {
    clientName: "Davi",
    clientEmail: "davi@exemplo.test",
    createdAt: antiga,
  });
  await historicalBooking(business.id, service.id, {
    clientName: "Davi Silva",
    clientEmail: "davi@exemplo.test",
    createdAt: recente,
  });

  const report = await runCrmBackfill({ apply: true });
  assert.equal(report.bookingsLinked, 2);
  assert.equal(report.customersCreated, 1);
  assert.equal(report.customersClaimingEmail, 1);
  assert.equal(report.profilesEstimatedSpend, 1);

  const customer = await testPrisma.customer.findFirstOrThrow();
  assert.equal(customer.state, CustomerIdentityState.PROVISIONAL);
  assert.equal(customer.passwordHash, null, "backfill não cria quem faz login");
  assert.equal(customer.email, "davi@exemplo.test");
  assert.equal(customer.emailVerifiedAt, null, "histórico não é prova de posse do e-mail");

  const profile = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(profile.source, CustomerLinkSource.MIGRATION);
  assert.equal(profile.displayName, "Davi", "nome da reserva mais antiga");
  assert.equal(profile.bookingsCount, 2);
  // Duas reservas sem retrato de preço, somadas pelo preço atual do serviço.
  assert.equal(profile.totalSpent.toString(), "120");
  assert.equal(profile.spendIsEstimated, true, "sem priceAtBooking o gasto é estimativa");
  assert.equal(profile.firstBookedAt?.getTime(), antiga.getTime());
  assert.equal(profile.lastBookedAt?.getTime(), recente.getTime());

  const bookings = await testPrisma.booking.findMany();
  assert.ok(bookings.every((booking) => booking.profileId === profile.id));
});

test("reserva com preço congelado dá gasto exato", async () => {
  const { business, service } = await seedBusinessWithHistory("bf-exato");
  await historicalBooking(business.id, service.id, {
    clientEmail: "exato@exemplo.test",
    priceAtBooking: 45,
  });

  const report = await runCrmBackfill({ apply: true });
  assert.equal(report.profilesExactSpend, 1);
  assert.equal(report.profilesEstimatedSpend, 0);

  const profile = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(profile.totalSpent.toString(), "45");
  assert.equal(profile.spendIsEstimated, false);
});

// A garantia mais importante do backfill: rodar de novo não pode duplicar nem
// inflar nada.
test("rodar --apply duas vezes é idempotente", async () => {
  const { business, service } = await seedBusinessWithHistory("bf-idempotente");
  await historicalBooking(business.id, service.id, { clientEmail: "davi@exemplo.test" });
  await historicalBooking(business.id, service.id, { clientEmail: "davi@exemplo.test" });
  await historicalBooking(business.id, service.id, { clientPhone: "11888887777" });

  const primeira = await runCrmBackfill({ apply: true });
  const depoisDaPrimeira = {
    customers: await testPrisma.customer.count(),
    profiles: await testPrisma.customerProfile.count(),
    profileRows: await testPrisma.customerProfile.findMany({
      orderBy: { id: "asc" },
      select: { id: true, bookingsCount: true, totalSpent: true },
    }),
  };

  const segunda = await runCrmBackfill({ apply: true });

  assert.equal(primeira.bookingsLinked, 3);
  assert.equal(segunda.bookingsLinked, 0, "nada sobrou para vincular");
  assert.equal(segunda.bookingsCandidate, 0, "nem candidata: todas já têm prontuário");
  assert.equal(segunda.customersCreated, 0);
  assert.equal(segunda.profilesCreated, 0);

  assert.equal(await testPrisma.customer.count(), depoisDaPrimeira.customers);
  assert.equal(await testPrisma.customerProfile.count(), depoisDaPrimeira.profiles);

  const agora = await testPrisma.customerProfile.findMany({
    orderBy: { id: "asc" },
    select: { id: true, bookingsCount: true, totalSpent: true },
  });
  assert.deepEqual(
    agora.map((row) => [row.id, row.bookingsCount, row.totalSpent.toString()]),
    depoisDaPrimeira.profileRows.map((row) => [
      row.id,
      row.bookingsCount,
      row.totalSpent.toString(),
    ]),
    "contador recalculado das linhas, nunca incrementado",
  );
});

// Execução interrompida no meio de um grupo: parte das reservas já vinculada,
// parte não. A reexecução tem que ACHAR o prontuário existente — e achar por
// dentro das reservas, porque o canal pode ter ficado nulo.
test("execução interrompida no meio de um grupo é retomada sem duplicar", async () => {
  const { business, service } = await seedBusinessWithHistory("bf-interrompido");

  // Simula o estado deixado por uma interrupção: identidade e prontuário
  // criados, uma reserva vinculada, duas ainda soltas.
  const customer = await testPrisma.customer.create({
    data: { name: "Davi", email: "davi@exemplo.test" },
  });
  const profile = await testPrisma.customerProfile.create({
    data: {
      customerId: customer.id,
      businessId: business.id,
      source: CustomerLinkSource.MIGRATION,
      displayName: "Davi",
      // De propósito zerado: é o estado de quem morreu antes de escrever o
      // agregado.
      bookingsCount: 0,
    },
  });

  await historicalBooking(business.id, service.id, {
    clientEmail: "davi@exemplo.test",
    profileId: profile.id,
  });
  await historicalBooking(business.id, service.id, { clientEmail: "davi@exemplo.test" });
  await historicalBooking(business.id, service.id, { clientEmail: "davi@exemplo.test" });

  const report = await runCrmBackfill({ apply: true });

  assert.equal(report.bookingsCandidate, 2, "só as duas soltas são candidatas");
  assert.equal(report.bookingsLinked, 2);
  assert.equal(report.profilesReused, 1, "reencontrou o prontuário pela reserva já vinculada");
  assert.equal(report.profilesCreated, 0);
  assert.equal(report.customersCreated, 0);

  assert.equal(await testPrisma.customerProfile.count(), 1, "nada duplicado");

  const atualizado = await testPrisma.customerProfile.findUniqueOrThrow({
    where: { id: profile.id },
  });
  assert.equal(atualizado.bookingsCount, 3, "o agregado cobre as três, não só as duas novas");
  assert.equal(atualizado.totalSpent.toString(), "180");
});

// A promessa central, na hora mais perigosa: o backfill é onde seria mais
// fácil unificar por e-mail e entregar o histórico de alguém a outro negócio.
test("mesmo e-mail em negócios diferentes: nunca funde", async () => {
  const a = await seedBusinessWithHistory("bf-negocio-a");
  const b = await seedBusinessWithHistory("bf-negocio-b");

  await historicalBooking(a.business.id, a.service.id, { clientEmail: "davi@exemplo.test" });
  await historicalBooking(b.business.id, b.service.id, { clientEmail: "davi@exemplo.test" });

  const report = await runCrmBackfill({ apply: true });

  assert.equal(report.customersCreated, 2, "duas identidades, uma por negócio");
  assert.equal(report.customersClaimingEmail, 1, "só a primeira reivindica o canal");
  assert.equal(report.customersWithoutChannel, 1);
  assert.equal(report.profilesCreated, 2);

  const comEmail = await testPrisma.customer.findMany({ where: { email: { not: null } } });
  assert.equal(comEmail.length, 1);

  // A que ficou sem canal ainda mostra o e-mail no prontuário: o valor não se
  // perde, só deixa de ser chave de identidade.
  const semCanal = await testPrisma.customer.findFirstOrThrow({
    where: { email: null },
    include: { profiles: true },
  });
  assert.equal(semCanal.profiles[0].displayEmail, "davi@exemplo.test");

  // E cada prontuário conta só as reservas da sua casa.
  const profiles = await testPrisma.customerProfile.findMany();
  assert.ok(profiles.every((profile) => profile.bookingsCount === 1));
  assert.notEqual(profiles[0].customerId, profiles[1].customerId);
});

test("reserva sem canal reconhecível fica sem resolver, de propósito", async () => {
  const { business, service } = await seedBusinessWithHistory("bf-sem-canal");
  await historicalBooking(business.id, service.id, {
    clientName: "Cliente do balcão",
    clientPhone: "999998888",
    clientEmail: null,
  });
  await historicalBooking(business.id, service.id, { clientEmail: "ok@exemplo.test" });

  const report = await runCrmBackfill({ apply: true });

  assert.equal(report.bookingsCandidate, 2);
  assert.equal(report.bookingsUnresolved, 1);
  assert.equal(report.bookingsLinked, 1);
  assert.equal(report.profilesCreated, 1);

  const semResolver = await testPrisma.booking.findFirstOrThrow({
    where: { clientName: "Cliente do balcão" },
  });
  assert.equal(semResolver.profileId, null, "melhor sem prontuário que com associação inventada");

  // E reexecutar não muda de ideia: continua sem resolver, sem acumular nada.
  const segunda = await runCrmBackfill({ apply: true });
  assert.equal(segunda.bookingsUnresolved, 1);
  assert.equal(segunda.profilesCreated, 0);
  assert.equal(await testPrisma.customerProfile.count(), 1);
});

// Reserva que a escrita ao vivo da fase 2 já vinculou não pode ser
// redirecionada, e o prontuário dela é reusado pelo resto do grupo.
test("vínculo criado ao vivo é respeitado e reusado pelo grupo", async () => {
  const { business, service } = await seedBusinessWithHistory("bf-ao-vivo");

  const customer = await testPrisma.customer.create({
    data: { name: "Davi", email: "davi@exemplo.test" },
  });
  const aoVivo = await testPrisma.customerProfile.create({
    data: {
      customerId: customer.id,
      businessId: business.id,
      // Origem diferente de MIGRATION: veio da reserva pública, não do backfill.
      source: CustomerLinkSource.PUBLIC_BOOKING,
      displayName: "Davi",
      bookingsCount: 1,
      totalSpent: new Prisma.Decimal(60),
    },
  });
  await historicalBooking(business.id, service.id, {
    clientEmail: "davi@exemplo.test",
    priceAtBooking: 60,
    profileId: aoVivo.id,
  });
  // E uma histórica solta, do mesmo contato.
  await historicalBooking(business.id, service.id, { clientEmail: "davi@exemplo.test" });

  const report = await runCrmBackfill({ apply: true });

  assert.equal(report.profilesReused, 1);
  assert.equal(report.profilesCreated, 0);
  assert.equal(await testPrisma.customerProfile.count(), 1);

  const profile = await testPrisma.customerProfile.findUniqueOrThrow({ where: { id: aoVivo.id } });
  assert.equal(profile.source, CustomerLinkSource.PUBLIC_BOOKING, "a origem original é preservada");
  assert.equal(profile.bookingsCount, 2);
  assert.equal(
    profile.spendIsEstimated,
    true,
    "uma das duas não tem retrato de preço, então o total virou estimativa",
  );
});

test("--business restringe o escopo e não toca nos outros negócios", async () => {
  const a = await seedBusinessWithHistory("bf-escopo-a");
  const b = await seedBusinessWithHistory("bf-escopo-b");
  await historicalBooking(a.business.id, a.service.id, { clientEmail: "a@exemplo.test" });
  await historicalBooking(b.business.id, b.service.id, { clientEmail: "b@exemplo.test" });

  const report = await runCrmBackfill({ apply: true, businessId: a.business.id });

  assert.equal(report.businesses, 1);
  assert.equal(report.bookingsLinked, 1);
  assert.equal(await testPrisma.customerProfile.count(), 1);
  assert.equal(
    await testPrisma.booking.count({ where: { businessId: b.business.id, profileId: null } }),
    1,
    "o outro negócio ficou exatamente como estava",
  );
});

// Determinismo: mesma base, mesmo resultado. Sem isto, uma simulação não
// serviria para aprovar a execução real.
test("mesma base produz o mesmo relatório em execuções independentes", async () => {
  async function semear() {
    const a = await seedBusinessWithHistory("bf-det-a");
    const b = await seedBusinessWithHistory("bf-det-b");
    await historicalBooking(a.business.id, a.service.id, { clientEmail: "x@exemplo.test" });
    await historicalBooking(a.business.id, a.service.id, { clientPhone: "11777776666" });
    await historicalBooking(b.business.id, b.service.id, { clientEmail: "x@exemplo.test" });
    await historicalBooking(b.business.id, b.service.id, { clientPhone: "999998888" });
  }

  await semear();
  const primeira = await runCrmBackfill({ apply: true });

  await resetDatabase();
  await semear();
  const segunda = await runCrmBackfill({ apply: true });

  assert.deepEqual(segunda, primeira);
  // E a simulação concorda com a execução real.
  await resetDatabase();
  await semear();
  const simulada = await runCrmBackfill();
  assert.deepEqual(simulada, primeira);
});
