// Precisa ser o primeiro import: aponta o PrismaClient para o schema de
// teste antes que `../app` construa o singleton. Ver comentário em testDb.ts.
import "./testDb";
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

function tokenFor(user: { id: number; role: Role; businessId: number | null }): string {
  return app.jwt.sign({ sub: user.id, role: user.role, businessId: user.businessId });
}

// Dois negócios completos e independentes. O ator é sempre alguém de "alfa"
// tentando alcançar dado de "beta" — a regra crítica do PRD: nenhum
// ADMIN/EMPLOYEE lê ou escreve fora do próprio businessId.
async function seedTwoBusinesses() {
  const alfa = await seedBookableBusiness("alfa");
  const beta = await seedBookableBusiness("beta");
  return { alfa, beta };
}

test("GET /services não vaza serviços de outro negócio", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "GET",
    url: "/services",
    headers: { authorization: `Bearer ${tokenFor(alfa.admin)}` },
  });

  assert.equal(response.statusCode, 200);
  const ids = response.json().services.map((service: { id: number }) => service.id);
  assert.deepEqual(ids, [alfa.service.id]);
  assert.ok(!ids.includes(beta.service.id));
});

test("PUT /services/:id de outro negócio responde 404 e não altera nada", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "PUT",
    url: `/services/${beta.service.id}`,
    headers: { authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload: { name: "Invadido", duration: 15, price: 1 },
  });

  assert.equal(response.statusCode, 404);

  const untouched = await testPrisma.service.findUniqueOrThrow({
    where: { id: beta.service.id },
  });
  assert.equal(untouched.name, beta.service.name);
});

test("DELETE /services/:id de outro negócio responde 404 e o serviço sobrevive", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "DELETE",
    url: `/services/${beta.service.id}`,
    headers: { authorization: `Bearer ${tokenFor(alfa.admin)}` },
  });

  assert.equal(response.statusCode, 404);
  assert.ok(await testPrisma.service.findUnique({ where: { id: beta.service.id } }));
});

test("DELETE /employees/:id de outro negócio responde 404 e o colaborador sobrevive", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "DELETE",
    url: `/employees/${beta.employee.id}`,
    headers: { authorization: `Bearer ${tokenFor(alfa.admin)}` },
  });

  assert.equal(response.statusCode, 404);
  assert.ok(await testPrisma.user.findUnique({ where: { id: beta.employee.id } }));
});

test("GET /employees não vaza colaboradores de outro negócio", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "GET",
    url: "/employees",
    headers: { authorization: `Bearer ${tokenFor(alfa.admin)}` },
  });

  assert.equal(response.statusCode, 200);
  const ids = response.json().employees.map((employee: { id: number }) => employee.id);
  assert.ok(!ids.includes(beta.employee.id));
});

test("vincular colaborador a serviço de outro negócio responde 404", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "POST",
    url: `/employees/${alfa.employee.id}/services`,
    headers: { authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload: { serviceId: beta.service.id },
  });

  assert.equal(response.statusCode, 404);
  const links = await testPrisma.employeeService.findMany({
    where: { employeeId: alfa.employee.id, serviceId: beta.service.id },
  });
  assert.equal(links.length, 0);
});

test("EMPLOYEE não edita a agenda de colaborador de outro negócio", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "PUT",
    url: `/availabilities/${beta.slots[0].id}`,
    headers: { authorization: `Bearer ${tokenFor(alfa.employee)}` },
    payload: { date: "2030-01-01", startTime: "23:00", endTime: "23:30" },
  });

  assert.equal(response.statusCode, 404);

  const untouched = await testPrisma.availability.findUniqueOrThrow({
    where: { id: beta.slots[0].id },
  });
  assert.equal(untouched.startTime, beta.slots[0].startTime);
});

test("EMPLOYEE não apaga slot de colaborador de outro negócio", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "DELETE",
    url: `/availabilities/${beta.slots[0].id}`,
    headers: { authorization: `Bearer ${tokenFor(alfa.employee)}` },
  });

  assert.equal(response.statusCode, 404);
  assert.ok(await testPrisma.availability.findUnique({ where: { id: beta.slots[0].id } }));
});

test("ADMIN não lê a agenda de colaborador de outro negócio", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "GET",
    url: `/availabilities?employeeId=${beta.employee.id}`,
    headers: { authorization: `Bearer ${tokenFor(alfa.admin)}` },
  });

  assert.equal(response.statusCode, 403);
});

// A reserva interna resolve o businessId pelo token, nunca pelo body — este
// teste é o que garante que continuará assim.
test("POST /bookings não reserva slot de outro negócio", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "POST",
    url: "/bookings",
    headers: { authorization: `Bearer ${tokenFor(alfa.employee)}` },
    payload: {
      availabilityId: beta.slots[0].id,
      serviceId: beta.service.id,
      clientName: "Cliente",
      clientPhone: "11999998888",
    },
  });

  assert.equal(response.statusCode, 404);
  assert.equal((await testPrisma.booking.findMany()).length, 0);

  const untouched = await testPrisma.availability.findUniqueOrThrow({
    where: { id: beta.slots[0].id },
  });
  assert.equal(untouched.isBooked, false);
});

test("ADMIN não edita o cadastro de outro negócio", async () => {
  const { alfa, beta } = await seedTwoBusinesses();

  const response = await app.inject({
    method: "PUT",
    url: `/businesses/${beta.business.id}`,
    headers: { authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload: { name: "Invadido", slug: "invadido", address: null },
  });

  assert.equal(response.statusCode, 403);

  const untouched = await testPrisma.business.findUniqueOrThrow({
    where: { id: beta.business.id },
  });
  assert.equal(untouched.name, beta.business.name);
  assert.equal(untouched.slug, beta.business.slug);
});

test("token sem negócio (SUPERADMIN) não passa por rota de negócio", async () => {
  await seedTwoBusinesses();
  const superadmin = await testPrisma.user.create({
    data: {
      name: "Super",
      email: "super@timeflow.test",
      password: "$2b$10$naoUsadoNosTestesDeIntegracao000000000000000000000000",
      role: Role.SUPERADMIN,
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/services",
    headers: { authorization: `Bearer ${tokenFor(superadmin)}` },
  });

  assert.equal(response.statusCode, 403);
});

test("rota de negócio sem token responde 401", async () => {
  const response = await app.inject({ method: "GET", url: "/services" });

  assert.equal(response.statusCode, 401);
});
