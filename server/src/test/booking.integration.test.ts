// Precisa ser o primeiro import: aponta o PrismaClient para o schema de
// teste antes que `../app` construa o singleton. Ver comentário em testDb.ts.
import "./testDb";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { BookingSource } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { bookingRepository } from "../repositories/bookingRepository";
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

function bookingPayload(availabilityId: number, serviceId: number, clientName: string) {
  return { availabilityId, serviceId, clientName, clientPhone: "11999998888" };
}

// RF15 no nível em que a garantia realmente mora. Chamar o repositório
// direto pula o pre-check de `isBooked` do service, que numa corrida por HTTP
// às vezes barra a segunda requisição antes dela chegar na transação — e um
// teste que só exercita o pre-check não prova nada sobre o claim.
test("claim atômico: duas transações no mesmo slot, só uma cria a reserva", async () => {
  const { service, slots } = await seedBookableBusiness("claim-direto");

  const data = {
    serviceId: service.id,
    clientPhone: "11999998888",
    clientEmail: null,
    source: BookingSource.ONLINE,
  };

  const [first, second] = await Promise.all([
    bookingRepository.createWithClaim([slots[0].id], { ...data, clientName: "Cliente A" }),
    bookingRepository.createWithClaim([slots[0].id], { ...data, clientName: "Cliente B" }),
  ]);

  const winners = [first, second].filter((booking) => booking !== null);
  assert.equal(winners.length, 1, "exatamente uma transação pode levar o slot");
  assert.equal((await testPrisma.booking.findMany()).length, 1);

  const slot = await testPrisma.availability.findUniqueOrThrow({ where: { id: slots[0].id } });
  assert.equal(slot.isBooked, true);
  assert.equal(slot.bookingId, winners[0]?.id);
});

// A mesma corrida pela porta da frente: aqui o que se garante é o contrato
// HTTP — o perdedor recebe 409, não um 500 nem um 201 duplicado.
test("duas reservas simultâneas no mesmo slot: só uma é aceita", async () => {
  const { business, service, slots } = await seedBookableBusiness("corrida-simples");
  const url = `/public/businesses/${business.slug}/bookings`;

  const [first, second] = await Promise.all([
    app.inject({
      method: "POST",
      url,
      payload: bookingPayload(slots[0].id, service.id, "Cliente A"),
    }),
    app.inject({
      method: "POST",
      url,
      payload: bookingPayload(slots[0].id, service.id, "Cliente B"),
    }),
  ]);

  assert.deepEqual([first.statusCode, second.statusCode].sort(), [201, 409]);

  const bookings = await testPrisma.booking.findMany();
  assert.equal(bookings.length, 1);

  const slot = await testPrisma.availability.findUniqueOrThrow({ where: { id: slots[0].id } });
  assert.equal(slot.isBooked, true);
  assert.equal(slot.bookingId, bookings[0].id);
});

// A versão perigosa da corrida: dois runs que se cruzam. Sem o claim do bloco
// inteiro, cada requisição levaria um pedaço e as duas reservas ficariam sem
// tempo para terminar o serviço.
test("runs sobrepostos de 60min: o perdedor não fica com meia reserva", async () => {
  const { business, service, slots } = await seedBookableBusiness("corrida-sobreposta", {
    duration: 60,
    startTimes: ["09:00", "09:30", "10:00"],
  });
  const url = `/public/businesses/${business.slug}/bookings`;

  const [first, second] = await Promise.all([
    // Ocupa 09:00 + 09:30.
    app.inject({
      method: "POST",
      url,
      payload: bookingPayload(slots[0].id, service.id, "Cliente A"),
    }),
    // Ocupa 09:30 + 10:00 — o slot do meio é disputado.
    app.inject({
      method: "POST",
      url,
      payload: bookingPayload(slots[1].id, service.id, "Cliente B"),
    }),
  ]);

  assert.deepEqual([first.statusCode, second.statusCode].sort(), [201, 409]);

  const bookings = await testPrisma.booking.findMany();
  assert.equal(bookings.length, 1);

  const booked = await testPrisma.availability.findMany({
    where: { isBooked: true },
    orderBy: { startTime: "asc" },
  });
  assert.equal(booked.length, 2, "o serviço de 60min tem que ocupar exatamente 2 slots");
  assert.ok(
    booked.every((slot) => slot.bookingId === bookings[0].id),
    "os dois slots ocupados têm que pertencer à mesma reserva",
  );

  // O slot que sobrou continua vendável: a transação perdedora foi desfeita
  // por inteiro, não deixou nada marcado pelo caminho.
  const free = await testPrisma.availability.findMany({ where: { isBooked: false } });
  assert.equal(free.length, 1);
  assert.equal(free[0].bookingId, null);
});

// Mesma garantia, mas pelo caminho interno (atendente no balcão) e cruzando
// os dois fluxos: os dois passam pelo mesmo createBookingForBusiness, e é
// isso que este teste tranca.
test("reserva interna e reserva pública disputando o mesmo slot", async () => {
  const { business, employee, service, slots } = await seedBookableBusiness("corrida-mista");
  const token = app.jwt.sign({
    sub: employee.id,
    role: employee.role,
    businessId: business.id,
  });

  const [publicResponse, internalResponse] = await Promise.all([
    app.inject({
      method: "POST",
      url: `/public/businesses/${business.slug}/bookings`,
      payload: bookingPayload(slots[0].id, service.id, "Cliente do site"),
    }),
    app.inject({
      method: "POST",
      url: "/bookings",
      headers: { authorization: `Bearer ${token}` },
      payload: bookingPayload(slots[0].id, service.id, "Cliente do balcão"),
    }),
  ]);

  assert.deepEqual([publicResponse.statusCode, internalResponse.statusCode].sort(), [201, 409]);
  assert.equal((await testPrisma.booking.findMany()).length, 1);
});

// Sem esta, o slot vira reservável de novo depois que a reserva existe: o
// pre-check de `isBooked` é a primeira linha de defesa, o claim é a segunda.
test("reservar um slot já ocupado responde 409", async () => {
  const { business, service, slots } = await seedBookableBusiness("slot-ocupado");
  const url = `/public/businesses/${business.slug}/bookings`;

  const first = await app.inject({
    method: "POST",
    url,
    payload: bookingPayload(slots[0].id, service.id, "Cliente A"),
  });
  assert.equal(first.statusCode, 201);

  const second = await app.inject({
    method: "POST",
    url,
    payload: bookingPayload(slots[0].id, service.id, "Cliente B"),
  });

  assert.equal(second.statusCode, 409);
  assert.equal((await testPrisma.booking.findMany()).length, 1);
});
