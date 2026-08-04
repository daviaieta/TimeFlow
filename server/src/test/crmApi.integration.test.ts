// Fase 4, passo 1: o CRM de negócio vira rota. O que esta suíte tranca é a
// fronteira de API da promessa central do produto — o painel enxerga só o
// prontuário DESTE negócio, endereçado por publicId, e nunca vaza a identidade
// global nem o histórico de outro tenant.
//
// Mesma ordem de import que o resto da suíte de CRM: testDb aponta o Prisma
// para o schema de teste e enableCrm liga a flag, ambos antes de `../app`
// avaliar `config/env`. Sem isto a flag fica desligada e as rotas somem.
import "./testDb";
import "./enableCrm";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { CustomerLinkSource, Role } from "@prisma/client";
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

// Token direto: os testes não passam pelo login, assinam o JWT com o segredo
// do app. businessId vem do token, nunca da URL.
function tokenFor(userId: number, role: Role, businessId: number) {
  return app.jwt.sign({ sub: userId, role, businessId });
}

function get(path: string, bearer: string) {
  return app.inject({ method: "GET", url: path, headers: { authorization: `Bearer ${bearer}` } });
}

// Cria um booking público — é o caminho que cria identidade + prontuário +
// agregados de verdade (testado em crmIdentity). Reuso aqui para o listing
// herdar o estado correto em vez de fabricá-lo à mão.
async function book(slug: string, clientName: string, availabilityId: number, serviceId: number, phone = "11999998888", email?: string) {
  const payload: Record<string, unknown> = {
    availabilityId,
    serviceId,
    clientName,
    clientPhone: phone,
  };
  if (email) payload.clientEmail = email;
  return app.inject({ method: "POST", url: `/public/businesses/${slug}/bookings`, payload });
}

// Para o teste de paginação: prontuário cru, sem reserva, controlando o
// lastBookedAt à mão. A listagem padrão ordena por lastBookedAt DESC, então
// precisamos de timestamps distintos para o cursor ser determinístico.
async function seedProfileRaw(businessId: number, displayName: string, lastBookedAt: Date) {
  const customer = await testPrisma.customer.create({ data: { name: displayName } });
  return testPrisma.customerProfile.create({
    data: {
      customerId: customer.id,
      businessId,
      displayName,
      source: CustomerLinkSource.PUBLIC_BOOKING,
      lastBookedAt,
      firstBookedAt: lastBookedAt,
      bookingsCount: 1,
    },
  });
}

const BASE_DATE = Date.UTC(2026, 0, 1);

test("lista vazia devolve array vazio e sem cursor", async () => {
  const { business, admin } = await seedBookableBusiness("clientes-vazio");

  const res = await get("/customers", tokenFor(admin.id, Role.ADMIN, business.id));
  assert.equal(res.statusCode, 200);

  const body = res.json();
  assert.deepEqual(body.profiles, []);
  assert.equal(body.nextCursor, null);
});

test("lista prontuários com totalSpent como string e sem id interno", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("clientes-lista", {
    startTimes: ["09:00", "09:30"],
  });
  await book(business.slug, "Davi", slots[0].id, service.id, "11999998888", "davi@x.test");
  await book(business.slug, "Ana", slots[1].id, service.id, "11999997777");

  const res = await get("/customers?sort=name", tokenFor(admin.id, Role.ADMIN, business.id));
  assert.equal(res.statusCode, 200);

  const { profiles } = res.json();
  assert.equal(profiles.length, 2);

  // Ordenado por nome: Ana antes de Davi.
  assert.equal(profiles[0].displayName, "Ana");
  assert.equal(profiles[1].displayName, "Davi");

  // totalSpent nunca cruza o fio como number (float perderia a precisão que
  // justifica o Decimal existir).
  assert.equal(typeof profiles[0].totalSpent, "string");
  assert.equal(profiles[0].bookingsCount, 1);
  assert.equal(profiles[0].totalSpent, service.price.toString());

  // publicId é UUID; o id inteiro nunca é exposto.
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  assert.match(profiles[0].publicId, uuid);
  assert.equal((profiles[0] as { id?: number }).id, undefined, "id interno nunca vaza");

  // Tags vêm em batch: array vazio quando não há.
  assert.deepEqual(profiles[0].tags, []);
  assert.equal(res.json().nextCursor, null);
});

test("detalhe por publicId pertencente ao negócio", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("clientes-detalhe");
  await book(business.slug, "Davi", slots[0].id, service.id, "11999998888", "davi@x.test");
  const profile = await testPrisma.customerProfile.findFirstOrThrow();

  const res = await get(`/customers/${profile.publicId}`, tokenFor(admin.id, Role.ADMIN, business.id));
  assert.equal(res.statusCode, 200);

  const body = res.json();
  assert.equal(body.profile.publicId, profile.publicId);
  assert.equal(body.profile.displayName, "Davi");
  assert.equal(body.profile.bookingsCount, 1);
  assert.equal((body.profile as { id?: number }).id, undefined);
});

test("publicId de outro negócio responde 404, não 403", async () => {
  const a = await seedBookableBusiness("iso-a");
  const b = await seedBookableBusiness("iso-b");
  await book(b.business.slug, "Davi", b.slots[0].id, b.service.id, "11999998888", "davi@x.test");
  const deB = await testPrisma.customerProfile.findFirstOrThrow();

  // Token do negócio A tenta ler o publicId do negócio B.
  const res = await get(`/customers/${deB.publicId}`, tokenFor(a.admin.id, Role.ADMIN, a.business.id));
  assert.equal(res.statusCode, 404, "404 confirma nada — 403 confirmaria que a linha existe em outro tenant");
});

test("lista de bookings de outro negócio responde 404", async () => {
  const a = await seedBookableBusiness("iso-booking-a");
  const b = await seedBookableBusiness("iso-booking-b");
  await book(b.business.slug, "Davi", b.slots[0].id, b.service.id, "11999998888");
  const deB = await testPrisma.customerProfile.findFirstOrThrow();

  const res = await get(
    `/customers/${deB.publicId}/bookings`,
    tokenFor(a.admin.id, Role.ADMIN, a.business.id),
  );
  assert.equal(res.statusCode, 404);
});

test("EMPLOYEE também lista e lê detalhe", async () => {
  const { business, employee, service, slots } = await seedBookableBusiness("clientes-equipe");
  await book(business.slug, "Davi", slots[0].id, service.id, "11999998888");

  const list = await get("/customers", tokenFor(employee.id, Role.EMPLOYEE, business.id));
  assert.equal(list.statusCode, 200);
  const { profiles } = list.json();
  assert.equal(profiles.length, 1);

  const detail = await get(`/customers/${profiles[0].publicId}`, tokenFor(employee.id, Role.EMPLOYEE, business.id));
  assert.equal(detail.statusCode, 200);
});

test("customer não autenticado recebe 401, não 200", async () => {
  const res = await app.inject({ method: "GET", url: "/customers" });
  assert.equal(res.statusCode, 401);
});

test("histórico devolve a reserva com serviço e funcionário", async () => {
  const { business, admin, service, slots, employee } = await seedBookableBusiness("clientes-historico");
  await book(business.slug, "Davi", slots[0].id, service.id, "11999998888");
  const profile = await testPrisma.customerProfile.findFirstOrThrow();

  const res = await get(
    `/customers/${profile.publicId}/bookings`,
    tokenFor(admin.id, Role.ADMIN, business.id),
  );
  assert.equal(res.statusCode, 200);

  const body = res.json();
  assert.equal(body.bookings.length, 1);
  const booking = body.bookings[0];
  assert.equal(booking.serviceName, service.name);
  assert.equal(booking.employeeName, employee.name, "o funcionário vem do primeiro slot");
  assert.equal(booking.priceAtBooking, service.price.toString(), "preço congelado como string");
  assert.ok(booking.date, "data do slot presente");
  assert.equal(body.nextCursor, null);
});

test("paginacao keyset: primeira página enche, cursor entrega o resto", async () => {
  const { business, admin } = await seedBookableBusiness("clientes-pagina");

  // 22 prontuários com lastBookedAt decrescente: a ordenação padrão (recent) é
  // lastBookedAt DESC, então o de timestamp maior vem primeiro.
  for (let i = 0; i < 22; i++) {
    await seedProfileRaw(business.id, `Cliente ${String(i + 1).padStart(2, "0")}`, new Date(BASE_DATE + i * 60_000));
  }

  const first = await get(
    "/customers?limit=20",
    tokenFor(admin.id, Role.ADMIN, business.id),
  );
  assert.equal(first.statusCode, 200);
  const firstBody = first.json();
  assert.equal(firstBody.profiles.length, 20, "primeira página cheia");
  assert.ok(firstBody.nextCursor, "há mais — cursor presente");

  // O primeiro da lista é o mais recente (timestamp maior).
  assert.equal(firstBody.profiles[0].displayName, "Cliente 22");

  const second = await get(
    `/customers?limit=20&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    tokenFor(admin.id, Role.ADMIN, business.id),
  );
  assert.equal(second.statusCode, 200);
  const secondBody = second.json();
  assert.equal(secondBody.profiles.length, 2, "restam dois");
  assert.equal(secondBody.nextCursor, null, "fim da lista");
  assert.equal(secondBody.profiles[0].displayName, "Cliente 02");

  // Semoverlap entre as páginas — base do keyset.
  const firstIds = new Set(firstBody.profiles.map((p: { publicId: string }) => p.publicId));
  for (const p of secondBody.profiles) {
    assert.ok(!firstIds.has(p.publicId), "página seguinte não repete item da anterior");
  }
});

test("cursor inválido responde 400, não 500", async () => {
  const { business, admin } = await seedBookableBusiness("clientes-cursor-lixo");

  const res = await get(
    `/customers?cursor=${encodeURIComponent("isto-nao-e-um-cursor")}`,
    tokenFor(admin.id, Role.ADMIN, business.id),
  );
  assert.equal(res.statusCode, 400);
});

test("publicId malformado responde 400 antes de carregar o controller", async () => {
  const { business, admin } = await seedBookableBusiness("clientes-uuid-lixo");

  const res = await get("/customers/nao-e-uuid", tokenFor(admin.id, Role.ADMIN, business.id));
  assert.equal(res.statusCode, 400, "o schema da rota barra uuid inválido");
});

test("search por nome filtra a lista", async () => {
  const { business, employee, service, slots } = await seedBookableBusiness("clientes-busca", {
    startTimes: ["09:00", "09:30"],
  });
  await book(business.slug, "Davi Silva", slots[0].id, service.id, "11999998888");
  await book(business.slug, "Ana Souza", slots[1].id, service.id, "11999997777");

  const res = await get("/customers?search=davi", tokenFor(employee.id, Role.EMPLOYEE, business.id));
  assert.equal(res.statusCode, 200);
  const { profiles } = res.json();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].displayName, "Davi Silva");
});
