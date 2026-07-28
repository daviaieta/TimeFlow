import { Role } from "@prisma/client";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { JwtPayload } from "../interfaces/auth";
import { employeeRepository } from "../repositories/employeeRepository";
import { availabilityRepository } from "../repositories/availabilityRepository";
import { planAvailabilities } from "./availabilityGenerator";
import {
  AvailabilityInput,
  AvailabilityRow,
  businessDayKey,
  dayKeyToDate,
  resolveScheduleTarget,
  toAvailabilityDto,
} from "./availabilityRules";

export interface GenerateInput {
  startDate: string;
  endDate: string;
  weekdays: number[];
  workStart: string;
  workEnd: string;
  breakStart?: string;
  breakEnd?: string;
  slotMinutes: number;
}

const MAX_RANGE_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;

function validateTimeRange(input: AvailabilityInput): void {
  // "HH:mm" com zero à esquerda compara corretamente como string
  if (input.endTime <= input.startTime) {
    throw new BadRequestError("endTime must be after startTime");
  }
}

async function findOwnedAvailability(
  employeeId: number,
  id: number,
): Promise<AvailabilityRow> {
  const availability = await availabilityRepository.findById(id);
  if (!availability || availability.employeeId !== employeeId) {
    throw new NotFoundError("Availability not found");
  }

  return availability;
}

// A trava é o Booking, não o isBooked: só slots com uma Booking real (feita
// por cliente externo ou atendente via painel) devem ser imutáveis. Checar
// isBooked sozinho seria muito amplo.
function assertNotBooked(availability: AvailabilityRow, action: string): void {
  if (availability.booking) {
    throw new ConflictError(`This time slot is booked and cannot be ${action}`);
  }
}

// Traduz a decisão pura de resolveScheduleTarget em erro HTTP e, quando o
// alvo é outra pessoa (só ADMIN chega aqui), confirma que ela é mesmo um
// colaborador do mesmo negócio.
async function resolveTargetEmployeeId(
  actor: JwtPayload,
  employeeIdParam: number | undefined,
): Promise<number> {
  const target = resolveScheduleTarget(actor, employeeIdParam);
  if (!target.allowed) {
    if (target.reason === "employee-id-required") {
      throw new BadRequestError("employeeId is required");
    }
    throw new ForbiddenError("You do not have permission to view this schedule");
  }

  // EMPLOYEE permitido é sempre a própria agenda — não precisa reconferir.
  if (actor.role === Role.EMPLOYEE) {
    return target.employeeId;
  }

  const employee = await employeeRepository.findById(target.employeeId);
  if (
    !employee ||
    employee.role !== Role.EMPLOYEE ||
    employee.businessId !== actor.businessId
  ) {
    throw new ForbiddenError("You do not have permission to view this schedule");
  }

  return target.employeeId;
}

export const availabilityService = {
  // A agenda é um dia por tela: sem data, abre em hoje.
  async listDay(
    actor: JwtPayload,
    employeeIdParam: number | undefined,
    dateParam: string | undefined,
    now: Date,
  ) {
    const employeeId = await resolveTargetEmployeeId(actor, employeeIdParam);
    const date = dateParam ?? businessDayKey(now);

    const rows = await availabilityRepository.findManyByEmployeeAndDate(
      employeeId,
      dayKeyToDate(date),
    );

    return { date, availabilities: rows.map(toAvailabilityDto) };
  },

  async updateAvailability(employeeId: number, id: number, input: AvailabilityInput) {
    validateTimeRange(input);

    const availability = await findOwnedAvailability(employeeId, id);
    assertNotBooked(availability, "changed");

    const data = {
      date: new Date(input.date),
      startTime: input.startTime,
      endTime: input.endTime,
    };
    const duplicate = await availabilityRepository.findByUniqueSlot(
      employeeId,
      data.date,
      data.startTime,
    );
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError("You already have a time slot starting at this time");
    }

    const updated = await availabilityRepository.update(id, data);
    return toAvailabilityDto(updated);
  },

  async generateAvailabilities(employeeId: number, input: GenerateInput) {
    if (input.endDate < input.startDate) {
      throw new BadRequestError("endDate must be on or after startDate");
    }

    const from = new Date(`${input.startDate}T00:00:00.000Z`);
    const to = new Date(`${input.endDate}T00:00:00.000Z`);
    if ((to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      throw new BadRequestError(`Period cannot exceed ${MAX_RANGE_DAYS} days`);
    }

    if (input.workEnd <= input.workStart) {
      throw new BadRequestError("workEnd must be after workStart");
    }

    const hasBreakStart = input.breakStart !== undefined;
    const hasBreakEnd = input.breakEnd !== undefined;
    if (hasBreakStart !== hasBreakEnd) {
      throw new BadRequestError("breakStart and breakEnd must be provided together");
    }
    if (
      input.breakStart !== undefined &&
      input.breakEnd !== undefined &&
      !(
        input.workStart < input.breakStart &&
        input.breakStart < input.breakEnd &&
        input.breakEnd <= input.workEnd
      )
    ) {
      throw new BadRequestError("Break must fit inside working hours");
    }

    const existing = await availabilityRepository.findManyByEmployeeInRange(
      employeeId,
      from,
      to,
    );

    const { kept, skippedOverlap } = planAvailabilities({
      startDate: input.startDate,
      endDate: input.endDate,
      weekdays: input.weekdays,
      window: {
        workStart: input.workStart,
        workEnd: input.workEnd,
        breakStart: input.breakStart,
        breakEnd: input.breakEnd,
      },
      slotMinutes: input.slotMinutes,
      existing,
      now: new Date(),
    });

    const result = await availabilityRepository.createMany(employeeId, kept);

    return {
      created: result.count,
      skipped: skippedOverlap + (kept.length - result.count),
    };
  },

  async deleteAvailability(employeeId: number, id: number) {
    const availability = await findOwnedAvailability(employeeId, id);
    assertNotBooked(availability, "deleted");

    await availabilityRepository.delete(id);
  },
};
