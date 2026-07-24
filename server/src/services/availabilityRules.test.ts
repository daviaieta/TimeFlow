import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAvailabilityData,
  normalizeClientName,
  toAvailabilityDto,
} from "./availabilityRules";

test("nome com espaços em volta é normalizado", () => {
  assert.equal(normalizeClientName("  Marcos  "), "Marcos");
});

test("nome vazio ou só espaços vira null", () => {
  assert.equal(normalizeClientName(""), null);
  assert.equal(normalizeClientName("   "), null);
  assert.equal(normalizeClientName(null), null);
  assert.equal(normalizeClientName(undefined), null);
});

test("cliente preenchido marca o horário como ocupado", () => {
  const data = buildAvailabilityData({
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "10:00",
    clientName: "Marcos",
  });

  assert.equal(data.clientName, "Marcos");
  assert.equal(data.isBooked, true);
});

test("sem cliente o horário fica livre", () => {
  const data = buildAvailabilityData({
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "10:00",
  });

  assert.equal(data.clientName, null);
  assert.equal(data.isBooked, false);
});

test("limpar o cliente libera o horário", () => {
  const data = buildAvailabilityData({
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "10:00",
    clientName: "   ",
  });

  assert.equal(data.clientName, null);
  assert.equal(data.isBooked, false);
});

test("dto marca locked quando existe booking real", () => {
  const dto = toAvailabilityDto({
    id: 1,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
    isBooked: true,
    clientName: "Marcos",
    booking: { id: 7 },
  });

  assert.equal(dto.locked, true);
  assert.equal(dto.date, "2026-07-25T00:00:00.000Z");
  assert.equal(dto.clientName, "Marcos");
});

test("encaixe manual não fica locked", () => {
  const dto = toAvailabilityDto({
    id: 2,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "11:00",
    endTime: "12:00",
    isBooked: true,
    clientName: "Rafael",
    booking: null,
  });

  assert.equal(dto.locked, false);
});
