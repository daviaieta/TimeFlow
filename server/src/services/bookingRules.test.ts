import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextSlotPerEmployee,
  isSlotUpcoming,
  serviceEndTime,
  slotRunForDuration,
  slotsFittingDuration,
} from "./bookingRules";

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

// Slot de meia hora, do jeito que o gerador cria.
function freeSlot(
  id: number,
  employeeId: number,
  date: string,
  startTime: string,
  endTime: string,
) {
  return { id, employeeId, date: new Date(`${date}T00:00:00.000Z`), startTime, endTime };
}

test("primeiro slot futuro por profissional", () => {
  const map = nextSlotPerEmployee(
    [
      freeSlot(1, 13, "2026-07-23", "09:00", "09:30"),
      freeSlot(2, 13, "2026-07-25", "14:00", "14:30"),
      freeSlot(3, 13, "2026-07-26", "09:00", "09:30"),
      freeSlot(4, 14, "2026-07-27", "10:00", "10:30"),
    ],
    0,
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
  const map = nextSlotPerEmployee(
    [freeSlot(1, 99, "2026-07-20", "09:00", "09:30")],
    0,
    now,
  );

  assert.equal(map.has(99), false);
});

test("próximo horário pula o que não comporta a duração do serviço", () => {
  const map = nextSlotPerEmployee(
    [
      freeSlot(1, 13, "2026-07-27", "09:00", "09:30"),
      freeSlot(2, 13, "2026-07-27", "10:00", "10:30"),
      freeSlot(3, 13, "2026-07-27", "10:30", "11:00"),
    ],
    60,
    now,
  );

  assert.equal(map.get(13)?.startTime, "10:00");
});

test("profissional sem espaço para o serviço fica de fora do mapa", () => {
  const map = nextSlotPerEmployee(
    [freeSlot(1, 13, "2026-07-27", "09:00", "09:30")],
    60,
    now,
  );

  assert.equal(map.has(13), false);
});

test("fim do serviço atravessa a hora cheia", () => {
  assert.equal(serviceEndTime("09:45", 30), "10:15");
  assert.equal(serviceEndTime("09:00", 45), "09:45");
});

// Grade de 30min do colaborador: um dia inteiro de slots livres contíguos.
function grid(times: string[], date = "2026-07-27"): {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
}[] {
  return times.map((startTime, index) => {
    const [hours, minutes] = startTime.split(":").map(Number);
    const end = hours * 60 + minutes + 30;
    return {
      id: index + 1,
      date: new Date(`${date}T00:00:00.000Z`),
      startTime,
      endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    };
  });
}

test("serviço que cabe num slot ocupa só ele", () => {
  const slots = grid(["09:00", "09:30", "10:00"]);
  const run = slotRunForDuration(slots, 1, 30);

  assert.deepEqual(run?.map((slot) => slot.startTime), ["09:00"]);
});

test("serviço de 1h ocupa dois slots consecutivos", () => {
  const slots = grid(["09:00", "09:30", "10:00"]);
  const run = slotRunForDuration(slots, 1, 60);

  assert.deepEqual(run?.map((slot) => slot.startTime), ["09:00", "09:30"]);
});

// 45min numa grade de 30 consome o slot seguinte inteiro: o colaborador não
// consegue atender ninguém nos 15min que sobram.
test("duração que não fecha na grade arredonda para cima", () => {
  const slots = grid(["09:00", "09:30", "10:00"]);
  const run = slotRunForDuration(slots, 1, 45);

  assert.deepEqual(run?.map((slot) => slot.startTime), ["09:00", "09:30"]);
});

// O caso do bug: 09:30 já reservado, então some da lista de livres e o
// serviço de 1h não tem como começar 09:00.
test("serviço não cabe quando o slot seguinte já está reservado", () => {
  const slots = grid(["09:00", "10:00", "10:30"]);

  assert.equal(slotRunForDuration(slots, 1, 60), null);
});

test("serviço não cabe quando há intervalo entre os slots", () => {
  const slots = [
    ...grid(["09:00"]),
    { id: 2, date: new Date("2026-07-27T00:00:00.000Z"), startTime: "09:40", endTime: "10:10" },
  ];

  assert.equal(slotRunForDuration(slots, 1, 60), null);
});

test("serviço não cabe no último slot do expediente", () => {
  const slots = grid(["17:30"]);

  assert.equal(slotRunForDuration(slots, 1, 60), null);
});

test("run não atravessa a virada do dia", () => {
  const slots = [
    ...grid(["17:30"], "2026-07-27"),
    ...grid(["09:00"], "2026-07-28"),
  ];

  assert.equal(slotRunForDuration(slots, 1, 60), null);
});

test("slot inexistente não vira run", () => {
  assert.equal(slotRunForDuration(grid(["09:00", "09:30"]), 99, 30), null);
});

test("listagem esconde horários onde o serviço não cabe", () => {
  const slots = grid(["09:00", "10:00", "10:30", "11:00"]);
  const fitting = slotsFittingDuration(slots, 60);

  assert.deepEqual(fitting.map((slot) => slot.startTime), ["10:00", "10:30"]);
});

test("serviço curto mantém todos os horários livres", () => {
  const slots = grid(["09:00", "10:00"]);

  assert.deepEqual(slotsFittingDuration(slots, 30).map((slot) => slot.id), [1, 2]);
});
