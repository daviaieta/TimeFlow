import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBookingSummary,
  toPublicBusinessDto,
  toPublicSlotDto,
} from "./publicBookingRules";

// now fixo: 2026-07-24 14:30 local
const now = new Date(2026, 6, 24, 14, 30);

function freeSlot(
  id: number,
  employeeId: number,
  date: string,
  startTime: string,
  endTime: string,
) {
  return { id, employeeId, date: new Date(`${date}T00:00:00.000Z`), startTime, endTime };
}

test("catálogo público omite serviço sem profissional e anexa próximo horário", () => {
  const dto = toPublicBusinessDto(
    { name: "old-brothers", slug: "old-brothers", logoUrl: null, bannerUrl: null },
    [
      {
        id: 1,
        name: "Corte",
        duration: 30,
        price: "50",
        employees: [
          { id: 13, name: "Derek", avatarUrl: null },
          { id: 14, name: "Tiago", avatarUrl: null },
        ],
      },
      { id: 2, name: "Fantasma", duration: 20, price: "10", employees: [] },
    ],
    [freeSlot(1, 13, "2026-07-25", "14:00", "14:30")],
    now,
  );

  assert.equal(dto.business.name, "old-brothers");
  assert.deepEqual(
    dto.services.map((s) => s.id),
    [1],
  );
  assert.equal(dto.services[0].price, "50");
  assert.deepEqual(dto.services[0].employees, [
    {
      id: 13,
      name: "Derek",
      avatarUrl: null,
      nextSlot: { date: "2026-07-25T00:00:00.000Z", startTime: "14:00" },
    },
    { id: 14, name: "Tiago", avatarUrl: null, nextSlot: null },
  ]);
  // profissionais no topo: união dos serviços visíveis, sem repetir
  assert.deepEqual(
    dto.professionals.map((p) => p.id),
    [13, 14],
  );
});

// Cada card de serviço promete um horário; a promessa tem que valer para
// AQUELE serviço, não para "qualquer coisa que caiba em meia hora".
test("cada serviço anuncia o próximo horário em que ele próprio cabe", () => {
  const dto = toPublicBusinessDto(
    { name: "old-brothers", slug: "old-brothers", logoUrl: null, bannerUrl: null },
    [
      {
        id: 1,
        name: "Barba",
        duration: 30,
        price: "35",
        employees: [{ id: 13, name: "Samuel", avatarUrl: null }],
      },
      {
        id: 2,
        name: "Descoloração",
        duration: 60,
        price: "200",
        employees: [{ id: 13, name: "Samuel", avatarUrl: null }],
      },
    ],
    [
      freeSlot(1, 13, "2026-07-27", "09:00", "09:30"),
      freeSlot(2, 13, "2026-07-27", "10:00", "10:30"),
      freeSlot(3, 13, "2026-07-27", "10:30", "11:00"),
    ],
    now,
  );

  assert.equal(dto.services[0].employees[0].nextSlot?.startTime, "09:00");
  assert.equal(dto.services[1].employees[0].nextSlot?.startTime, "10:00");
  // Sem serviço escolhido, o card do profissional mostra a primeira vaga.
  assert.equal(dto.professionals[0].nextSlot?.startTime, "09:00");
});

test("toPublicBusinessDto repassa as imagens do negócio e dos profissionais", () => {
  const dto = toPublicBusinessDto(
    {
      name: "Barbearia Alfa",
      slug: "alfa",
      address: null,
      logoUrl: "https://cdn.exemplo.com/businesses/1/logo-a.webp",
      bannerUrl: null,
    },
    [
      {
        id: 1,
        name: "Corte",
        duration: 30,
        price: "40.00",
        employees: [
          { id: 9, name: "Zé", avatarUrl: "https://cdn.exemplo.com/employees/9/avatar-b.webp" },
        ],
      },
    ],
    [],
    new Date("2026-07-29T12:00:00.000Z"),
  );

  assert.equal(dto.business.logoUrl, "https://cdn.exemplo.com/businesses/1/logo-a.webp");
  assert.equal(dto.business.bannerUrl, null);
  assert.equal(
    dto.professionals[0].avatarUrl,
    "https://cdn.exemplo.com/employees/9/avatar-b.webp",
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
    slot: { date: new Date("2026-07-25T00:00:00.000Z"), startTime: "09:00" },
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
    endTime: "09:30",
    clientName: "Marcos",
  });
});

// O fim do atendimento é o serviço que dita, não o slot da grade: era daqui
// que saía "1h · 14:00 – 14:30" na tela de confirmação.
test("resumo termina no fim do serviço, não no fim do slot", () => {
  const summary = buildBookingSummary({
    businessName: "old-brothers",
    service: { name: "Descoloração", duration: 60, price: "200" },
    employeeName: "Samuel",
    slot: { date: new Date("2026-07-27T00:00:00.000Z"), startTime: "14:00" },
    clientName: "Rafael",
  });

  assert.equal(summary.startTime, "14:00");
  assert.equal(summary.endTime, "15:00");
});
