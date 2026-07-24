import { Role } from "@prisma/client";
import { ConflictError, NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";
import { bookingRepository } from "../repositories/bookingRepository";
import { businessRepository } from "../repositories/businessRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import { normalizeClientName } from "./availabilityRules";
import {
  buildBookingSummary,
  firstUpcomingPerEmployee,
  isSlotUpcoming,
  toPublicBusinessDto,
  toPublicSlotDto,
} from "./publicBookingRules";

interface PublicBookingInput {
  availabilityId: number;
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
}

export const publicBookingService = {
  async getBusinessPage(slug: string) {
    const business = await businessRepository.findBySlugWithCatalog(slug);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const now = new Date();
    const from = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const freeSlots = await availabilityRepository.findManyFreeByBusiness(
      business.id,
      from,
    );

    return toPublicBusinessDto(
      business,
      business.services.map((service) => ({
        id: service.id,
        name: service.name,
        duration: service.duration,
        price: service.price,
        employees: service.employees.map((link) => link.employee),
      })),
      firstUpcomingPerEmployee(freeSlots, now),
    );
  },

  async listEmployeeSlots(slug: string, employeeId: number, now: Date) {
    const business = await businessRepository.findBySlug(slug);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const employee = await employeeRepository.findById(employeeId);
    if (
      !employee ||
      employee.businessId !== business.id ||
      employee.role !== Role.EMPLOYEE
    ) {
      throw new NotFoundError("Employee not found");
    }

    const free = await availabilityRepository.findManyFreeByEmployee(employeeId);
    return free.filter((slot) => isSlotUpcoming(slot, now)).map(toPublicSlotDto);
  },

  async createBooking(slug: string, input: PublicBookingInput, now: Date) {
    const business = await businessRepository.findBySlug(slug);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const service = await serviceRepository.findById(input.serviceId);
    if (!service || service.businessId !== business.id) {
      throw new NotFoundError("Service not found");
    }

    const slot = await availabilityRepository.findByIdForBooking(input.availabilityId);
    if (!slot || slot.employee.businessId !== business.id) {
      throw new NotFoundError("Time slot not found");
    }

    const offers = await employeeRepository.hasServiceLink(
      slot.employee.id,
      service.id,
    );
    if (!offers) {
      throw new ConflictError("This professional does not offer this service");
    }

    if (!isSlotUpcoming(slot, now)) {
      throw new ConflictError("This time slot is no longer available");
    }

    const clientName = normalizeClientName(input.clientName);
    if (!clientName) {
      throw new ConflictError("Client name is required");
    }

    const booking = await bookingRepository.createWithClaim(slot.id, {
      serviceId: service.id,
      clientName,
      clientPhone: input.clientPhone.trim(),
      clientEmail: input.clientEmail?.trim() || null,
    });
    if (!booking) {
      throw new ConflictError("This time slot has just been booked");
    }

    return buildBookingSummary({
      businessName: business.name,
      service,
      employeeName: slot.employee.name,
      slot,
      clientName,
    });
  },
};
