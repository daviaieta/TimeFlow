import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayChipLabel,
  dayParts,
  earliestNextSlot,
  formatPrice,
  groupSlotsByDay,
  groupSlotsByPeriod,
  isValidPhone,
  nextSlotLabel,
  serviceWindow,
  type PublicSlot,
} from "./publicBooking.ts";

function slot(id: number, date: string, startTime = "09:00"): PublicSlot {
  return { id, date, startTime, endTime: "10:00" };
}

test("partes da data alimentam o seletor de dia", () => {
  assert.deepEqual(dayParts("2026-07-27", "2026-07-25"), {
    weekday: "seg",
    day: "27",
    month: "julho",
    year: "2026",
    isToday: false,
  });
});

test("o dia de hoje se identifica no seletor", () => {
  assert.equal(dayParts("2026-07-25", "2026-07-25").isToday, true);
});

// O cliente escolhe um começo; o fim quem dita é a duração do serviço.
test("janela do atendimento vai do início até o fim do serviço", () => {
  assert.equal(serviceWindow("14:00", 60), "14:00 – 15:00");
  assert.equal(serviceWindow("09:45", 30), "09:45 – 10:15");
});

test("horários se separam por período do dia", () => {
  const periods = groupSlotsByPeriod([
    slot(1, "2026-07-27T00:00:00.000Z", "09:00"),
    slot(2, "2026-07-27T00:00:00.000Z", "11:30"),
    slot(3, "2026-07-27T00:00:00.000Z", "14:00"),
    slot(4, "2026-07-27T00:00:00.000Z", "19:00"),
  ]);

  assert.deepEqual(
    periods.map((period) => [period.label, period.slots.length]),
    [
      ["Manhã", 2],
      ["Tarde", 1],
      ["Noite", 1],
    ],
  );
});

test("período sem nenhum horário não vira seção vazia", () => {
  const periods = groupSlotsByPeriod([slot(1, "2026-07-27T00:00:00.000Z", "14:00")]);

  assert.deepEqual(
    periods.map((period) => period.label),
    ["Tarde"],
  );
});

test("agrupa slots por dia preservando a ordem", () => {
  const groups = groupSlotsByDay([
    slot(1, "2026-07-25T00:00:00.000Z"),
    slot(2, "2026-07-25T00:00:00.000Z", "14:00"),
    slot(3, "2026-07-26T00:00:00.000Z"),
  ]);

  assert.deepEqual(
    groups.map(([day, slots]) => [day, slots.length]),
    [
      ["2026-07-25", 2],
      ["2026-07-26", 1],
    ],
  );
});

test("chip do dia de hoje vira 'Hoje'", () => {
  assert.equal(dayChipLabel("2026-07-24", "2026-07-24"), "Hoje");
});

test("chip de outro dia mostra semana e data", () => {
  // 2026-07-25 é sábado
  assert.equal(dayChipLabel("2026-07-25", "2026-07-24"), "sáb, 25 jul");
  // 2026-08-03 é segunda
  assert.equal(dayChipLabel("2026-08-03", "2026-07-24"), "seg, 03 ago");
});

test("telefone válido tem pelo menos 8 dígitos", () => {
  assert.equal(isValidPhone("(11) 99999-0000"), true);
  assert.equal(isValidPhone("11999990000"), true);
  assert.equal(isValidPhone("123"), false);
  assert.equal(isValidPhone("abc-def"), false);
});

test("rótulo do próximo horário", () => {
  assert.equal(
    nextSlotLabel({ date: "2026-07-24T00:00:00.000Z", startTime: "14:00" }, "2026-07-24"),
    "Hoje 14:00",
  );
  assert.equal(
    nextSlotLabel({ date: "2026-07-27T00:00:00.000Z", startTime: "09:00" }, "2026-07-24"),
    "seg, 27 jul 09:00",
  );
});

test("menor próximo horário entre profissionais", () => {
  const earliest = earliestNextSlot([
    { id: 1, name: "A", nextSlot: { date: "2026-07-27T00:00:00.000Z", startTime: "09:00" } },
    { id: 2, name: "B", nextSlot: { date: "2026-07-25T00:00:00.000Z", startTime: "16:00" } },
    { id: 3, name: "C", nextSlot: null },
  ]);

  assert.deepEqual(earliest, { date: "2026-07-25T00:00:00.000Z", startTime: "16:00" });
});

test("mesmo dia desempata pelo horário", () => {
  const earliest = earliestNextSlot([
    { id: 1, name: "A", nextSlot: { date: "2026-07-25T00:00:00.000Z", startTime: "16:00" } },
    { id: 2, name: "B", nextSlot: { date: "2026-07-25T00:00:00.000Z", startTime: "09:30" } },
  ]);

  assert.equal(earliest?.startTime, "09:30");
});

test("ninguém com vaga devolve null", () => {
  assert.equal(earliestNextSlot([{ id: 1, name: "A", nextSlot: null }]), null);
});

test("preço decimal vira moeda brasileira", () => {
  assert.equal(formatPrice("50"), "R$ 50,00");
  assert.equal(formatPrice("50.5"), "R$ 50,50");
  assert.equal(formatPrice("1250.75"), "R$ 1250,75");
});
