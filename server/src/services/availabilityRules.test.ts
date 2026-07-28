import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@prisma/client";
import {
  businessDayKey,
  businessToday,
  dayKeyToDate,
  resolveScheduleTarget,
  toAvailabilityDto,
  utcMidnight,
} from "./availabilityRules";

test("slot livre não tem booking", () => {
  const dto = toAvailabilityDto({
    id: 1,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
    isBooked: false,
    booking: null,
  });

  assert.equal(dto.booking, null);
  assert.equal(dto.isBooked, false);
});

test("slot reservado carrega cliente e serviço do booking", () => {
  const dto = toAvailabilityDto({
    id: 3,
    date: new Date("2026-08-10T00:00:00.000Z"),
    startTime: "11:00",
    endTime: "12:30",
    isBooked: true,
    booking: {
      id: 9,
      clientName: "Cliente Externo",
      clientPhone: "11999998888",
      clientEmail: null,
      service: { id: 4, name: "Corte Masculino" },
    },
  });

  assert.equal(dto.booking?.clientName, "Cliente Externo");
  assert.equal(dto.booking?.service.name, "Corte Masculino");
  assert.equal(dto.date, "2026-08-10T00:00:00.000Z");
  assert.equal(dto.isBooked, true);
});

test("utcMidnight zera a hora e mantém o dia UTC", () => {
  const result = utcMidnight(new Date("2026-07-25T23:47:12.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("utcMidnight numa data já em meia-noite não muda", () => {
  const result = utcMidnight(new Date("2026-07-25T00:00:00.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("businessToday usa o dia em America/Sao_Paulo, não o dia UTC", () => {
  // 21:30 em São Paulo (UTC-3) já é 00:30 do dia seguinte em UTC.
  const result = businessToday(new Date("2026-07-26T00:30:00.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("businessToday na virada da meia-noite local", () => {
  // 00:30 em São Paulo é 03:30 UTC do mesmo dia.
  const result = businessToday(new Date("2026-07-25T03:30:00.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("businessDayKey devolve o dia local do negócio, não o dia UTC", () => {
  assert.equal(businessDayKey(new Date("2026-07-26T00:30:00.000Z")), "2026-07-25");
});

test("dayKeyToDate ancora o dia em meia-noite UTC", () => {
  assert.equal(dayKeyToDate("2026-07-25").toISOString(), "2026-07-25T00:00:00.000Z");
});

test("EMPLOYEE sem employeeId cai na própria agenda", () => {
  const target = resolveScheduleTarget({ sub: 7, role: Role.EMPLOYEE }, undefined);
  assert.deepEqual(target, { allowed: true, employeeId: 7 });
});

test("EMPLOYEE pedindo a própria agenda explicitamente é permitido", () => {
  const target = resolveScheduleTarget({ sub: 7, role: Role.EMPLOYEE }, 7);
  assert.deepEqual(target, { allowed: true, employeeId: 7 });
});

test("EMPLOYEE não pode pedir a agenda de um colega", () => {
  const target = resolveScheduleTarget({ sub: 7, role: Role.EMPLOYEE }, 8);
  assert.deepEqual(target, { allowed: false, reason: "forbidden" });
});

test("ADMIN sem employeeId não tem agenda própria pra cair", () => {
  const target = resolveScheduleTarget({ sub: 1, role: Role.ADMIN }, undefined);
  assert.deepEqual(target, { allowed: false, reason: "employee-id-required" });
});

test("ADMIN pode pedir a agenda de qualquer colaborador", () => {
  const target = resolveScheduleTarget({ sub: 1, role: Role.ADMIN }, 8);
  assert.deepEqual(target, { allowed: true, employeeId: 8 });
});
