// Fase 4, passo 5: o painel passa a escrever. Cadastro de balcão
// (POST /customers), edição de prontuário (PATCH /customers/:publicId),
// configuração de CRM por negócio e métricas.
//
// O que esta suíte tranca:
// 1. cadastro cria Customer + CustomerProfile pelas MESMAS regras de identidade
//    da reserva pública (§4.1), com source STAFF e sem poder de login;
// 2. cadastrar de novo o mesmo contato reencontra o prontuário em vez de
//    duplicar (200 + created:false);
// 3. o id interno nunca aparece — nem o do prontuário, nem o da identidade;
// 4. PATCH mexe só no prontuário DESTE negócio e nunca na identidade global;
// 5. publicId de outro negócio é 404, nunca 403 (§11.4);
// 6. settings e metrics são de ADMIN; a equipe leva 403;
// 7. settings de um negócio não vazam nem afetam o outro.
import "./testDb";
import "./enableCrm";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { CustomerLinkSource, CustomerProfileStatus, Role } from "@prisma/client";
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
  return app.inject({ method: "GET", url: path, headers: { authorization: `Bearer ${bearer}` } });
}

function post(path: string, bearer: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: path,
    headers: { authorization: `Bearer ${bearer}` },
    payload,
  });
}

function patch(path: string, bearer: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "PATCH",
    url: path,
    headers: { authorization: `Bearer ${bearer}` },
    payload,
  });
}

async function book(slug: string, clientName: string, availabilityId: number, serviceId: number, phone: string) {
  return app.inject({
    method: "POST",
    url: `/public/businesses/${slug}/bookings`,
    payload: { availabilityId, serviceId, clientName, clientPhone: phone },
  });
}

// -----------------------------------------------------------------------------
// POST /customers
// -----------------------------------------------------------------------------

test("cadastro pela equipe cria prontuário com agregados zerados", async () => {
  const { business, admin } = await seedBookableBusiness("cad-basico");

  const res = await post("/customers", tokenFor(admin.id, Role.ADMIN, business.id), {
    displayName: "Davi Silva",
    displayPhone: "(11) 99999-8888",
    displayEmail: "davi@x.test",
  });

  assert.equal(res.statusCode, 201);
  const { profile, created } = res.json();
  assert.equal(created, true);

  assert.equal(profile.displayName, "Davi Silva");
  // display* fica como foi digitado — é para onde o negócio liga.
  assert.equal(profile.displayPhone, "(11) 99999-8888");
  assert.equal(profile.displayEmail, "davi@x.test");
  assert.equal(profile.status, "ACTIVE");

  // Cadastro não é reserva: nenhum agregado se move.
  assert.equal(profile.bookingsCount, 0);
  assert.equal(profile.totalSpent, "0");
  assert.equal(profile.loyaltyPoints, 0);
  assert.equal(profile.firstBookedAt, null);
  assert.equal(profile.lastBookedAt, null);
  assert.deepEqual(profile.tags, []);

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  assert.match(profile.publicId, uuid);
  assert.equal((profile as { id?: number }).id, undefined, "id interno nunca vaza");
  assert.equal((profile as { customerId?: number }).customerId, undefined, "identidade global nunca vaza");
});

test("cadastro grava source STAFF e identidade sem poder de login", async () => {
  const { business, admin } = await seedBookableBusiness("cad-identidade");

  const res = await post("/customers", tokenFor(admin.id, Role.ADMIN, business.id), {
    displayName: "Davi",
    displayPhone: "11999998888",
  });
  assert.equal(res.statusCode, 201);

  const profile = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(profile.source, CustomerLinkSource.STAFF);
  assert.equal(profile.businessId, business.id);

  const customer = await testPrisma.customer.findUniqueOrThrow({ where: { id: profile.customerId } });
  // O canal canônico é o normalizado, não o digitado (§15.11).
  assert.equal(customer.phoneE164, "+5511999998888");
  // Cadastro de balcão não é conta: PROVISIONAL, sem senha, sem verificação.
  assert.equal(customer.state, "PROVISIONAL");
  assert.equal(customer.passwordHash, null);
  assert.equal(customer.phoneVerifiedAt, null);
  assert.equal(customer.emailVerifiedAt, null);
});

test("cadastrar o mesmo telefone duas vezes reencontra o prontuário", async () => {
  const { business, admin } = await seedBookableBusiness("cad-duplicado");
  const bearer = tokenFor(admin.id, Role.ADMIN, business.id);

  const first = await post("/customers", bearer, { displayName: "Davi", displayPhone: "11999998888" });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().created, true);

  // Mesmo número, escrito de outro jeito: é a mesma pessoa.
  const second = await post("/customers", bearer, {
    displayName: "Davi Silva",
    displayPhone: "+55 (11) 99999-8888",
  });
  assert.equal(second.statusCode, 200, "não é criação — é reencontro");
  assert.equal(second.json().created, false);
  assert.equal(second.json().profile.publicId, first.json().profile.publicId);

  assert.equal(await testPrisma.customerProfile.count(), 1, "nenhuma duplicata");
});

test("cadastro reencontra o cliente que já reservou pelo site", async () => {
  const { business, admin, service, slots } = await seedBookableBusiness("cad-ja-reservou");
  await book(business.slug, "Davi", slots[0].id, service.id, "11999998888");

  const res = await post("/customers", tokenFor(admin.id, Role.ADMIN, business.id), {
    displayName: "Davi",
    displayPhone: "11999998888",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().created, false);
  // O histórico veio junto: é o mesmo prontuário, não um cadastro paralelo.
  assert.equal(res.json().profile.bookingsCount, 1);
  assert.equal(await testPrisma.customerProfile.count(), 1);
});

test("mesmo contato em dois negócios são identidades separadas", async () => {
  const a = await seedBookableBusiness("cad-iso-a");
  const b = await seedBookableBusiness("cad-iso-b");

  const payload = { displayName: "Davi", displayPhone: "11999998888", displayEmail: "davi@x.test" };
  const inA = await post("/customers", tokenFor(a.admin.id, Role.ADMIN, a.business.id), payload);
  const inB = await post("/customers", tokenFor(b.admin.id, Role.ADMIN, b.business.id), payload);

  assert.equal(inA.statusCode, 201);
  assert.equal(inB.statusCode, 201, "negócio B cadastra o seu próprio, sem enxergar o de A");
  assert.notEqual(inA.json().profile.publicId, inB.json().profile.publicId);

  // §4.1: canal NÃO verificado nunca atravessa negócio. Duas identidades.
  const profiles = await testPrisma.customerProfile.findMany();
  assert.equal(profiles.length, 2);
  assert.notEqual(profiles[0].customerId, profiles[1].customerId);
});

test("cadastro só com nome é aceito", async () => {
  const { business, admin } = await seedBookableBusiness("cad-so-nome");

  const res = await post("/customers", tokenFor(admin.id, Role.ADMIN, business.id), {
    displayName: "Cliente de balcão",
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.json().profile.displayPhone, null);
});

test("telefone irreconhecível é 400, não cadastro sem canal", async () => {
  const { business, admin } = await seedBookableBusiness("cad-tel-ruim");

  const res = await post("/customers", tokenFor(admin.id, Role.ADMIN, business.id), {
    displayName: "Davi",
    displayPhone: "999998888",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(await testPrisma.customerProfile.count(), 0);
});

test("e-mail malformado e nome vazio são 400", async () => {
  const { business, admin } = await seedBookableBusiness("cad-invalidos");
  const bearer = tokenFor(admin.id, Role.ADMIN, business.id);

  const badEmail = await post("/customers", bearer, { displayName: "Davi", displayEmail: "davi@x" });
  assert.equal(badEmail.statusCode, 400);

  const noName = await post("/customers", bearer, { displayName: "" });
  assert.equal(noName.statusCode, 400, "o schema da rota barra nome vazio");
});

test("EMPLOYEE cadastra; requisição sem token é 401", async () => {
  const { business, employee } = await seedBookableBusiness("cad-equipe");

  const res = await post("/customers", tokenFor(employee.id, Role.EMPLOYEE, business.id), {
    displayName: "Cliente do balcão",
  });
  assert.equal(res.statusCode, 201, "quem atende também cadastra");

  const anon = await app.inject({
    method: "POST",
    url: "/customers",
    payload: { displayName: "Invasor" },
  });
  assert.equal(anon.statusCode, 401);
});

// -----------------------------------------------------------------------------
// PATCH /customers/:publicId
// -----------------------------------------------------------------------------

test("PATCH edita nome e status e devolve o prontuário inteiro", async () => {
  const { business, admin } = await seedBookableBusiness("edit-basico");
  const bearer = tokenFor(admin.id, Role.ADMIN, business.id);
  const created = await post("/customers", bearer, { displayName: "Davi", displayPhone: "11999998888" });
  const { publicId } = created.json().profile;

  const res = await patch(`/customers/${publicId}`, bearer, {
    displayName: "Davi Silva",
    status: "BLOCKED",
  });

  assert.equal(res.statusCode, 200);
  const { profile } = res.json();
  assert.equal(profile.publicId, publicId);
  assert.equal(profile.displayName, "Davi Silva");
  assert.equal(profile.status, "BLOCKED");
  // A resposta é a mesma forma do GET: o painel não precisa de dois shapes.
  assert.equal(profile.bookingsCount, 0);
  assert.deepEqual(profile.tags, []);
  assert.equal((profile as { id?: number }).id, undefined);

  const row = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(row.status, CustomerProfileStatus.BLOCKED);
});

test("PATCH com null apaga o campo, e nunca toca a identidade global", async () => {
  const { business, admin } = await seedBookableBusiness("edit-null");
  const bearer = tokenFor(admin.id, Role.ADMIN, business.id);
  const created = await post("/customers", bearer, {
    displayName: "Davi",
    displayPhone: "11999998888",
  });
  const { publicId } = created.json().profile;

  const res = await patch(`/customers/${publicId}`, bearer, { displayPhone: null });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().profile.displayPhone, null);
  assert.equal(res.json().profile.displayName, "Davi", "campo ausente não é tocado");

  // O canal canônico da identidade continua onde estava: o painel edita o
  // prontuário deste negócio, não quem a pessoa é no sistema.
  const customer = await testPrisma.customer.findFirstOrThrow();
  assert.equal(customer.phoneE164, "+5511999998888");
});

test("PATCH vazio, status inválido e telefone irreconhecível são 400", async () => {
  const { business, admin } = await seedBookableBusiness("edit-invalido");
  const bearer = tokenFor(admin.id, Role.ADMIN, business.id);
  const created = await post("/customers", bearer, { displayName: "Davi" });
  const { publicId } = created.json().profile;

  assert.equal((await patch(`/customers/${publicId}`, bearer, {})).statusCode, 400);
  assert.equal((await patch(`/customers/${publicId}`, bearer, { status: "SUMIU" })).statusCode, 400);
  assert.equal(
    (await patch(`/customers/${publicId}`, bearer, { displayPhone: "123" })).statusCode,
    400,
  );
});

test("PATCH em publicId de outro negócio responde 404, não 403", async () => {
  const a = await seedBookableBusiness("edit-iso-a");
  const b = await seedBookableBusiness("edit-iso-b");
  const created = await post("/customers", tokenFor(b.admin.id, Role.ADMIN, b.business.id), {
    displayName: "Davi",
  });
  const { publicId } = created.json().profile;

  const res = await patch(`/customers/${publicId}`, tokenFor(a.admin.id, Role.ADMIN, a.business.id), {
    displayName: "Sequestrado",
  });

  assert.equal(res.statusCode, 404, "403 confirmaria que a linha existe em outro tenant");
  const row = await testPrisma.customerProfile.findFirstOrThrow();
  assert.equal(row.displayName, "Davi", "nada foi escrito");
});

test("PATCH com publicId malformado é 400 antes do controller", async () => {
  const { business, admin } = await seedBookableBusiness("edit-uuid-lixo");

  const res = await patch("/customers/nao-e-uuid", tokenFor(admin.id, Role.ADMIN, business.id), {
    displayName: "Davi",
  });
  assert.equal(res.statusCode, 400);
});

// -----------------------------------------------------------------------------
// GET / PATCH /crm/settings
// -----------------------------------------------------------------------------

test("settings responde os defaults antes de existir linha", async () => {
  const { business, admin } = await seedBookableBusiness("cfg-default");

  const res = await get("/crm/settings", tokenFor(admin.id, Role.ADMIN, business.id));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().settings, {
    loyaltyEnabled: false,
    pointsPerUnit: 1,
    pointsExpireAfterDays: null,
    customerLoginEnabled: true,
  });

  // "Nunca configurado" não cria linha à toa.
  assert.equal(await testPrisma.businessCrmSettings.count(), 0);
});

test("PATCH cria a linha e o GET seguinte reflete", async () => {
  const { business, admin } = await seedBookableBusiness("cfg-patch");
  const bearer = tokenFor(admin.id, Role.ADMIN, business.id);

  const res = await patch("/crm/settings", bearer, {
    loyaltyEnabled: true,
    pointsPerUnit: 5,
    pointsExpireAfterDays: 365,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().settings.loyaltyEnabled, true);
  assert.equal(res.json().settings.pointsPerUnit, 5);
  assert.equal(res.json().settings.pointsExpireAfterDays, 365);
  // Campo não enviado mantém o default.
  assert.equal(res.json().settings.customerLoginEnabled, true);
  // businessId não sai na resposta: o token já diz de quem é.
  assert.equal((res.json().settings as { businessId?: number }).businessId, undefined);

  const again = await get("/crm/settings", bearer);
  assert.equal(again.json().settings.pointsPerUnit, 5);

  // Segundo PATCH atualiza a mesma linha em vez de criar outra.
  const cleared = await patch("/crm/settings", bearer, { pointsExpireAfterDays: null });
  assert.equal(cleared.json().settings.pointsExpireAfterDays, null, "null = ponto não expira");
  assert.equal(cleared.json().settings.pointsPerUnit, 5, "o resto sobrevive ao patch parcial");
  assert.equal(await testPrisma.businessCrmSettings.count(), 1);
});

test("settings inválidas são 400", async () => {
  const { business, admin } = await seedBookableBusiness("cfg-invalida");
  const bearer = tokenFor(admin.id, Role.ADMIN, business.id);

  assert.equal((await patch("/crm/settings", bearer, {})).statusCode, 400);
  assert.equal((await patch("/crm/settings", bearer, { pointsPerUnit: 0 })).statusCode, 400);
  assert.equal((await patch("/crm/settings", bearer, { pointsExpireAfterDays: -5 })).statusCode, 400);
  assert.equal(await testPrisma.businessCrmSettings.count(), 0);
});

test("settings de um negócio não afetam o outro", async () => {
  const a = await seedBookableBusiness("cfg-iso-a");
  const b = await seedBookableBusiness("cfg-iso-b");

  await patch("/crm/settings", tokenFor(a.admin.id, Role.ADMIN, a.business.id), {
    loyaltyEnabled: true,
    pointsPerUnit: 9,
  });

  const inB = await get("/crm/settings", tokenFor(b.admin.id, Role.ADMIN, b.business.id));
  assert.equal(inB.json().settings.loyaltyEnabled, false);
  assert.equal(inB.json().settings.pointsPerUnit, 1);
});

test("EMPLOYEE não lê nem escreve settings", async () => {
  const { business, employee } = await seedBookableBusiness("cfg-equipe");
  const bearer = tokenFor(employee.id, Role.EMPLOYEE, business.id);

  assert.equal((await get("/crm/settings", bearer)).statusCode, 403);
  assert.equal((await patch("/crm/settings", bearer, { loyaltyEnabled: true })).statusCode, 403);
  assert.equal(
    (await app.inject({ method: "GET", url: "/crm/settings" })).statusCode,
    401,
  );
});

// -----------------------------------------------------------------------------
// GET /crm/metrics
// -----------------------------------------------------------------------------

test("métricas contam só a carteira do próprio negócio", async () => {
  const a = await seedBookableBusiness("met-a", { startTimes: ["09:00", "09:30"] });
  const b = await seedBookableBusiness("met-b");
  const bearer = tokenFor(a.admin.id, Role.ADMIN, a.business.id);

  await book(a.business.slug, "Davi", a.slots[0].id, a.service.id, "11999998888");
  await book(a.business.slug, "Ana", a.slots[1].id, a.service.id, "11999997777");
  await book(b.business.slug, "De outro negócio", b.slots[0].id, b.service.id, "11999996666");

  // Um bloqueado para a contagem por status ter o que separar.
  const ana = await testPrisma.customerProfile.findFirstOrThrow({ where: { displayName: "Ana" } });
  await patch(`/customers/${ana.publicId}`, bearer, { status: "BLOCKED" });

  const res = await get("/crm/metrics", bearer);
  assert.equal(res.statusCode, 200);

  const { metrics } = res.json();
  assert.equal(metrics.total, 2, "o prontuário do negócio B não entra");
  assert.equal(metrics.active, 1);
  assert.equal(metrics.blocked, 1);
  assert.equal(metrics.newThisMonth, 2);

  // topSpenders: só quem reservou, com Decimal como string e sem id interno.
  assert.equal(metrics.topSpenders.length, 2);
  assert.equal(typeof metrics.topSpenders[0].totalSpent, "string");
  assert.equal(metrics.topSpenders[0].totalSpent, a.service.price.toString());
  assert.equal(metrics.topSpenders[0].bookingsCount, 1);
  assert.match(
    metrics.topSpenders[0].publicId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  assert.equal((metrics.topSpenders[0] as { id?: number }).id, undefined);
});

test("métricas de negócio sem cliente devolvem zeros", async () => {
  const { business, admin } = await seedBookableBusiness("met-vazio");

  const res = await get("/crm/metrics", tokenFor(admin.id, Role.ADMIN, business.id));
  assert.equal(res.statusCode, 200);

  const { metrics } = res.json();
  assert.equal(metrics.total, 0);
  assert.equal(metrics.active, 0);
  assert.equal(metrics.blocked, 0);
  assert.equal(metrics.newThisMonth, 0);
  assert.deepEqual(metrics.topSpenders, []);
});

test("métricas são de ADMIN; EMPLOYEE leva 403 e anônimo 401", async () => {
  const { business, employee } = await seedBookableBusiness("met-equipe");

  const res = await get("/crm/metrics", tokenFor(employee.id, Role.EMPLOYEE, business.id));
  assert.equal(res.statusCode, 403);

  const anon = await app.inject({ method: "GET", url: "/crm/metrics" });
  assert.equal(anon.statusCode, 401);
});

// -----------------------------------------------------------------------------
// Flag desligada
// -----------------------------------------------------------------------------

test("com o CRM ligado as rotas de escrita existem (sanidade da flag)", async () => {
  // O caso oposto (flag desligada → 404) já é coberto pela suíte que NÃO
  // importa enableCrm; aqui só se confirma que o registro condicional pegou as
  // rotas novas junto com as antigas.
  const { business, admin } = await seedBookableBusiness("flag-ligada");
  const bearer = tokenFor(admin.id, Role.ADMIN, business.id);

  assert.notEqual((await post("/customers", bearer, { displayName: "Davi" })).statusCode, 404);
  assert.notEqual((await get("/crm/settings", bearer)).statusCode, 404);
  assert.notEqual((await get("/crm/metrics", bearer)).statusCode, 404);
});
