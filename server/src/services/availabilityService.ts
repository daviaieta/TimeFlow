import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";
import {
  AvailabilityInput,
  AvailabilityRow,
  buildAvailabilityData,
  toAvailabilityDto,
} from "./availabilityRules";

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

// A trava é o Booking, não o isBooked: um encaixe digitado pelo próprio
// colaborador precisa continuar corrigível por ele.
function assertNotBooked(availability: AvailabilityRow, action: string): void {
  if (availability.booking) {
    throw new ConflictError(`This time slot is booked and cannot be ${action}`);
  }
}

export const availabilityService = {
  async listAvailabilities(employeeId: number) {
    const availabilities = await availabilityRepository.findManyByEmployee(employeeId);
    return availabilities.map(toAvailabilityDto);
  },

  async createAvailability(employeeId: number, input: AvailabilityInput) {
    validateTimeRange(input);

    const data = buildAvailabilityData(input);
    const duplicate = await availabilityRepository.findByUniqueSlot(
      employeeId,
      data.date,
      data.startTime,
    );
    if (duplicate) {
      throw new ConflictError("You already have a time slot starting at this time");
    }

    const created = await availabilityRepository.create(employeeId, data);
    return toAvailabilityDto(created);
  },

  async updateAvailability(employeeId: number, id: number, input: AvailabilityInput) {
    validateTimeRange(input);

    const availability = await findOwnedAvailability(employeeId, id);
    assertNotBooked(availability, "changed");

    const data = buildAvailabilityData(input);
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

  async deleteAvailability(employeeId: number, id: number) {
    const availability = await findOwnedAvailability(employeeId, id);
    assertNotBooked(availability, "deleted");

    await availabilityRepository.delete(id);
  },
};
