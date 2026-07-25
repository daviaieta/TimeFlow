import assert from "node:assert/strict";
import { test } from "node:test";
import { SlotRow, buildKpis, formatCents, toCents, bucketOccupancy, buildHeatmap } from "./dashboardRules";

// Helper local: monta um slot com o mínimo e deixa o teste declarar só o que importa.
function slot(overrides: Partial<SlotRow> = {}): SlotRow {
  return {
    id: 1,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
    isBooked: false,
    clientName: null,
    employeeId: 1,
    booking: null,
    ...overrides,
  };
}

function booked(price: string, overrides: Partial<SlotRow> = {}): SlotRow {
  return slot({
    isBooked: true,
    booking: {
      clientName: "Cliente",
      clientPhone: "11999999999",
      service: { id: 1, name: "Corte", price },
    },
    ...overrides,
  });
}

test("centavos convertem sem erro de float", () => {
  assert.equal(toCents("120.00"), 12000);
  assert.equal(toCents("0.10"), 10);
  assert.equal(toCents("99.99"), 9999);
  assert.equal(formatCents(12000), "120.00");
  assert.equal(formatCents(0), "0.00");
  assert.equal(formatCents(5), "0.05");
});

test("ocupação divide reservados pelo total de horários", () => {
  const kpis = buildKpis(
    [booked("50.00"), slot({ id: 2 }), slot({ id: 3 }), slot({ id: 4 })],
    { current: 0, previous: 0 },
  );

  assert.equal(kpis.occupancy.booked, 1);
  assert.equal(kpis.occupancy.total, 4);
  assert.equal(kpis.occupancy.rate, 0.25);
});

test("sem nenhum horário criado a ocupação é zero, não NaN", () => {
  const kpis = buildKpis([], { current: 0, previous: 0 });

  assert.equal(kpis.occupancy.rate, 0);
  assert.equal(kpis.occupancy.total, 0);
  assert.equal(kpis.revenue.scheduled, "0.00");
  assert.equal(kpis.revenue.averageTicket, "0.00");
});

test("encaixe manual conta como ocupado mas não como reserva do site", () => {
  const manual = slot({ id: 2, isBooked: true, clientName: "Encaixe" });
  const kpis = buildKpis([booked("50.00"), manual], { current: 0, previous: 0 });

  assert.equal(kpis.bookings.total, 2);
  assert.equal(kpis.bookings.online, 1);
  assert.equal(kpis.bookings.manual, 1);
});

test("receita soma só os slots com booking real", () => {
  const manual = slot({ id: 2, isBooked: true, clientName: "Encaixe" });
  const kpis = buildKpis(
    [booked("50.00"), booked("30.50", { id: 3 }), manual],
    { current: 0, previous: 0 },
  );

  assert.equal(kpis.revenue.scheduled, "80.50");
  assert.equal(kpis.revenue.averageTicket, "40.25");
});

test("ticket médio é zero quando só existem encaixes manuais", () => {
  const manual = slot({ isBooked: true, clientName: "Encaixe" });
  const kpis = buildKpis([manual], { current: 0, previous: 0 });

  assert.equal(kpis.revenue.scheduled, "0.00");
  assert.equal(kpis.revenue.averageTicket, "0.00");
});

test("ritmo repassa as contagens de reservas criadas", () => {
  const kpis = buildKpis([], { current: 12, previous: 8 });

  assert.equal(kpis.pace.current, 12);
  assert.equal(kpis.pace.previous, 8);
});

test("janela de 7 dias gera um bucket por dia, inclusive dias vazios", () => {
  const from = new Date("2026-07-25T00:00:00.000Z"); // sábado
  const buckets = bucketOccupancy(
    [
      booked("50.00", { date: new Date("2026-07-25T00:00:00.000Z") }),
      slot({ id: 2, date: new Date("2026-07-25T00:00:00.000Z") }),
      slot({ id: 3, date: new Date("2026-07-27T00:00:00.000Z") }),
    ],
    7,
    from,
  );

  assert.equal(buckets.length, 7);
  assert.equal(buckets[0].key, "2026-07-25");
  assert.equal(buckets[0].label, "sáb 25");
  assert.equal(buckets[0].booked, 1);
  assert.equal(buckets[0].free, 1);
  assert.equal(buckets[1].booked, 0);
  assert.equal(buckets[1].free, 0);
  assert.equal(buckets[2].free, 1);
});

test("janela de 30 dias agrupa por semana", () => {
  const from = new Date("2026-07-25T00:00:00.000Z");
  const buckets = bucketOccupancy(
    [
      slot({ date: new Date("2026-07-26T00:00:00.000Z") }),
      slot({ id: 2, date: new Date("2026-08-05T00:00:00.000Z") }),
    ],
    30,
    from,
  );

  assert.equal(buckets.length, 5); // ceil(30 / 7)
  assert.equal(buckets[0].key, "2026-07-25"); // 25–31 jul
  assert.equal(buckets[0].free, 1);
  assert.equal(buckets[1].key, "2026-08-01"); // 1–7 ago
  assert.equal(buckets[1].label, "1–7 ago");
  assert.equal(buckets[1].free, 1); // o slot de 05/08 cai nesta semana
  assert.equal(buckets[2].free, 0);
});

test("semana que cruza o mês mostra os dois meses no rótulo", () => {
  const buckets = bucketOccupancy([], 30, new Date("2026-07-28T00:00:00.000Z"));

  assert.equal(buckets[0].label, "28 jul–3 ago");
});

test("mapa de calor agrupa por dia da semana e hora, em UTC", () => {
  const cells = buildHeatmap([
    booked("50.00", { date: new Date("2026-07-27T00:00:00.000Z"), startTime: "09:00" }),
    slot({ id: 2, date: new Date("2026-07-27T00:00:00.000Z"), startTime: "09:30" }),
    slot({ id: 3, date: new Date("2026-07-28T00:00:00.000Z"), startTime: "14:00" }),
  ]);

  assert.equal(cells.length, 2);
  assert.deepEqual(cells[0], { weekday: 1, hour: 9, booked: 1, total: 2 });
  assert.deepEqual(cells[1], { weekday: 2, hour: 14, booked: 0, total: 1 });
});

test("mapa de calor não emite célula sem nenhum horário", () => {
  assert.deepEqual(buildHeatmap([]), []);
});
