import assert from "node:assert/strict";
import { test } from "node:test";
import type { Availability } from "./types.ts";
import {
  formatDuration,
  formatMinutes,
  groupByDate,
  localDayKey,
  orderDayGroups,
  summarizeDay,
  toMinutes,
} from "./schedule.ts";

function slot(overrides: Partial<Availability> & { id: number }): Availability {
  return {
    date: "2026-07-25T00:00:00.000Z",
    startTime: "09:00",
    endTime: "10:00",
    isBooked: false,
    clientName: null,
    ...overrides,
  };
}

test("converte HH:mm em minutos", () => {
  assert.equal(toMinutes("09:00"), 540);
  assert.equal(toMinutes("00:30"), 30);
});

test("formata minutos em rótulo legível", () => {
  assert.equal(formatMinutes(60), "1h");
  assert.equal(formatMinutes(30), "30min");
  assert.equal(formatMinutes(90), "1h30");
  assert.equal(formatMinutes(180), "3h");
});

test("calcula duração de um horário", () => {
  assert.equal(formatDuration("09:00", "10:30"), "1h30");
});

test("agrupa por dia preservando a ordem", () => {
  const groups = groupByDate([
    slot({ id: 1, date: "2026-07-25T00:00:00.000Z" }),
    slot({ id: 2, date: "2026-07-26T00:00:00.000Z" }),
    slot({ id: 3, date: "2026-07-25T00:00:00.000Z", startTime: "11:00" }),
  ]);

  assert.deepEqual(
    groups.map(([day, slots]) => [day, slots.length]),
    [
      ["2026-07-25", 2],
      ["2026-07-26", 1],
    ],
  );
});

test("orderDayGroups mantém a ordem recebida para próximos", () => {
  const groups = groupByDate([
    slot({ id: 1, date: "2026-07-25T00:00:00.000Z" }),
    slot({ id: 2, date: "2026-07-26T00:00:00.000Z" }),
  ]);

  assert.deepEqual(
    orderDayGroups(groups, "upcoming").map(([day]) => day),
    ["2026-07-25", "2026-07-26"],
  );
});

// Bug corrigido nesta entrega: a versão antiga invertia a lista inteira antes
// de agrupar, o que também invertia a ordem dos horários DENTRO de cada dia.
// orderDayGroups só inverte a ordem dos GRUPOS — cada Availability[] interno
// continua na ordem em que chegou (crescente).
test("orderDayGroups para passados inverte os dias, não os horários de cada dia", () => {
  const groups = groupByDate([
    slot({ id: 1, date: "2026-07-24T00:00:00.000Z", startTime: "09:00" }),
    slot({ id: 2, date: "2026-07-24T00:00:00.000Z", startTime: "11:00" }),
    slot({ id: 3, date: "2026-07-25T00:00:00.000Z" }),
  ]);

  const ordered = orderDayGroups(groups, "past");

  assert.deepEqual(
    ordered.map(([day]) => day),
    ["2026-07-25", "2026-07-24"],
  );
  assert.deepEqual(
    ordered[1][1].map((s) => s.id),
    [1, 2],
  );
});

test("resume ocupados, livres e total do dia", () => {
  const resumo = summarizeDay([
    slot({ id: 1, isBooked: true, clientName: "Marcos" }),
    slot({ id: 2, startTime: "10:00", endTime: "11:00" }),
    slot({ id: 3, startTime: "14:00", endTime: "15:30" }),
  ]);

  assert.equal(resumo.busy, 1);
  assert.equal(resumo.free, 2);
  assert.equal(resumo.label, "1 ocupado · 2 livres · 3h30");
});

test("resume no singular quando há um de cada", () => {
  const resumo = summarizeDay([
    slot({ id: 1, isBooked: true, clientName: "Marcos" }),
    slot({ id: 2, startTime: "10:00", endTime: "11:00" }),
  ]);

  assert.equal(resumo.label, "1 ocupado · 1 livre · 2h");
});

test("chave do dia usa data local, não UTC", () => {
  assert.equal(localDayKey(new Date(2026, 6, 25, 23, 30)), "2026-07-25");
});
