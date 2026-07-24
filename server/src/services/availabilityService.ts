import { Availability } from "@prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";

interface AvailabilityInput {
  date: string;
  startTime: string;
  endTime: string;
}

function validateTimeRange(input: AvailabilityInput): void {
  // "HH:mm" com zero à esquerda compara corretamente como string
  if (input.endTime <= input.startTime) {
    throw new BadRequestError("endTime must be after startTime");
  }
}

async function findOwnedAvailability(employeeId: number, id: number): Promise<Availability> {
  const availability = await availabilityRepository.findById(id);
  if (!availability || availability.employeeId !== employeeId) {
    throw new NotFoundError("Availability not found");
  }

  return availability;
}

export const availabilityService = {
  listAvailabilities(employeeId: number) {
    return availabilityRepository.findManyByEmployee(employeeId);
  },

  async createAvailability(employeeId: number, input: AvailabilityInput) {
    validateTimeRange(input);

    const date = new Date(input.date);
    const duplicate = await availabilityRepository.findByUniqueSlot(
      employeeId,
      date,
      input.startTime,
    );
    if (duplicate) {
      throw new ConflictError("You already have a time slot starting at this time");
    }

    return availabilityRepository.create(employeeId, {
      date,
      startTime: input.startTime,
      endTime: input.endTime,
    });
  },

  async updateAvailability(employeeId: number, id: number, input: AvailabilityInput) {
    validateTimeRange(input);

    const availability = await findOwnedAvailability(employeeId, id);
    if (availability.isBooked) {
      throw new ConflictError("This time slot is booked and cannot be changed");
    }

    const date = new Date(input.date);
    const duplicate = await availabilityRepository.findByUniqueSlot(
      employeeId,
      date,
      input.startTime,
    );
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError("You already have a time slot starting at this time");
    }

    return availabilityRepository.update(id, {
      date,
      startTime: input.startTime,
      endTime: input.endTime,
    });
  },

  async deleteAvailability(employeeId: number, id: number) {
    const availability = await findOwnedAvailability(employeeId, id);
    if (availability.isBooked) {
      throw new ConflictError("This time slot is booked and cannot be deleted");
    }

    await availabilityRepository.delete(id);
  },
};
