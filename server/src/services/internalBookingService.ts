import { Role } from "@prisma/client";
import { JwtPayload } from "../interfaces/auth";
import { NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";
import { createBookingForBusiness, CreateBookingInput } from "./bookingService";

export const internalBookingService = {
  async createBooking(actor: JwtPayload, businessId: number, input: CreateBookingInput, now: Date) {
    // EMPLOYEE só mexe na própria agenda — nem enxerga a de um colega, então
    // também não pode reservar num horário dele. 404 (e não 403) porque é o
    // mesmo que o slot não existir do ponto de vista de quem pediu.
    if (actor.role === Role.EMPLOYEE) {
      const slot = await availabilityRepository.findByIdForBooking(input.availabilityId);
      if (!slot || slot.employee.id !== actor.sub) {
        throw new NotFoundError("Time slot not found");
      }
    }

    const result = await createBookingForBusiness(businessId, input, now, "INTERNAL");

    return {
      id: result.booking.id,
      clientName: result.clientName,
      clientPhone: result.booking.clientPhone,
      clientEmail: result.booking.clientEmail,
      service: { id: result.service.id, name: result.service.name },
      employeeName: result.employeeName,
      date: result.slot.date.toISOString(),
      startTime: result.slot.startTime,
    };
  },
};
