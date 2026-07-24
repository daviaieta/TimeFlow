import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBookingSummary,
  firstUpcomingPerEmployee,
  isSlotUpcoming,
  toPublicBusinessDto,
  toPublicSlotDto,
} from "./publicBookingRules";

// now fixo: 2026-07-24 14:30 local
const now = new Date(2026, 6, 24, 14, 30);

test("slot de dia futuro está disponível", () => {
  assert.equal(
    isSlotUpcoming({ date: new Date("2026-07-25T00:00:00.000Z"), startTime: "09:00" }, now),
    true,
  );
});

test("slot de dia passado não está disponível", () => {
  assert.equal(
    isSlotUpcoming({ date: new Date("2026-07-23T00:00:00.000Z"), startTime: "09:00" }, now),
    false,
  );
});

test("slot de hoje só vale se a hora ainda não passou", () => {
  const today = new Date("2026-07-24T00:00:00.000Z");
  assert.equal(isSlotUpcoming({ date: today, startTime: "14:00" }, now), false);
  assert.equal(isSlotUpcoming({ date: today, startTime: "14:30" }, now), false);
  assert.equal(isSlotUpcoming({ date: today, startTime: "15:00" }, now), true);
});

test("primeiro slot futuro por profissional", () => {
  const map = firstUpcomingPerEmployee(
    [
      { employeeId: 13, date: new Date("2026-07-23T00:00:00.000Z"), startTime: "09:00" },
      { employeeId: 13, date: new Date("2026-07-25T00:00:00.000Z"), startTime: "14:00" },
      { employeeId: 13, date: new Date("2026-07-26T00:00:00.000Z"), startTime: "09:00" },
      { employeeId: 14, date: new Date("2026-07-27T00:00:00.000Z"), startTime: "10:00" },
    ],
    now,
  );

  assert.deepEqual(map.get(13), {
    date: "2026-07-25T00:00:00.000Z",
    startTime: "14:00",
  });
  assert.deepEqual(map.get(14), {
    date: "2026-07-27T00:00:00.000Z",
    startTime: "10:00",
  });
});

test("profissional sem slot futuro fica de fora do mapa", () => {
  const map = firstUpcomingPerEmployee(
    [{ employeeId: 99, date: new Date("2026-07-20T00:00:00.000Z"), startTime: "09:00" }],
    now,
  );

  assert.equal(map.has(99), false);
});

test("catálogo público omite serviço sem profissional e anexa próximo horário", () => {
  const nextSlots = new Map([
    [13, { date: "2026-07-25T00:00:00.000Z", startTime: "14:00" }],
  ]);

  const dto = toPublicBusinessDto(
    { name: "old-brothers", slug: "old-brothers" },
    [
      {
        id: 1,
        name: "Corte",
        duration: 30,
        price: "50",
        employees: [
          { id: 13, name: "Derek" },
          { id: 14, name: "Tiago" },
        ],
      },
      { id: 2, name: "Fantasma", duration: 20, price: "10", employees: [] },
    ],
    nextSlots,
  );

  assert.equal(dto.business.name, "old-brothers");
  assert.deepEqual(
    dto.services.map((s) => s.id),
    [1],
  );
  assert.equal(dto.services[0].price, "50");
  assert.deepEqual(dto.services[0].employees, [
    { id: 13, name: "Derek", nextSlot: { date: "2026-07-25T00:00:00.000Z", startTime: "14:00" } },
    { id: 14, name: "Tiago", nextSlot: null },
  ]);
  // profissionais no topo: união dos serviços visíveis, sem repetir
  assert.deepEqual(
    dto.professionals.map((p) => p.id),
    [13, 14],
  );
});

test("slot público serializa a data como ISO", () => {
  const dto = toPublicSlotDto({
    id: 7,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
  });

  assert.deepEqual(dto, {
    id: 7,
    date: "2026-07-25T00:00:00.000Z",
    startTime: "09:00",
    endTime: "10:00",
  });
});

test("resumo da reserva junta negócio, serviço, profissional e slot", () => {
  const summary = buildBookingSummary({
    businessName: "old-brothers",
    service: { name: "Corte", duration: 30, price: "50" },
    employeeName: "Derek",
    slot: { date: new Date("2026-07-25T00:00:00.000Z"), startTime: "09:00", endTime: "10:00" },
    clientName: "Marcos",
  });

  assert.deepEqual(summary, {
    business: "old-brothers",
    service: "Corte",
    duration: 30,
    price: "50",
    employee: "Derek",
    date: "2026-07-25T00:00:00.000Z",
    startTime: "09:00",
    endTime: "10:00",
    clientName: "Marcos",
  });
});
