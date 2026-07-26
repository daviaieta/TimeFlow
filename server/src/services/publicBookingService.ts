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
  isSlotUpcoming,
  slotRunForDuration,
  slotsFittingDuration,
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
      freeSlots,
      now,
    );
  },

  // A duração do serviço é obrigatória aqui: sem ela a lista ofereceria
  // horários em que o atendimento não termina antes do próximo compromisso.
  async listEmployeeSlots(
    slug: string,
    employeeId: number,
    serviceId: number,
    now: Date,
  ) {
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

    const service = await serviceRepository.findById(serviceId);
    if (!service || service.businessId !== business.id) {
      throw new NotFoundError("Service not found");
    }

    const free = await availabilityRepository.findManyFreeByEmployee(employeeId);
    const upcoming = free.filter((slot) => isSlotUpcoming(slot, now));

    return slotsFittingDuration(upcoming, service.duration).map(toPublicSlotDto);
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

    if (slot.isBooked) {
      throw new ConflictError("This time slot has just been booked");
    }

    const clientName = normalizeClientName(input.clientName);
    if (!clientName) {
      throw new ConflictError("Client name is required");
    }

    // O cliente escolhe onde COMEÇA; quem decide onde termina é a duração do
    // serviço. Revalidamos o run no servidor porque a lista que o cliente viu
    // pode ter envelhecido entre a escolha e o envio.
    const free = await availabilityRepository.findManyFreeByEmployee(slot.employee.id);
    const run = slotRunForDuration(
      free.filter((candidate) => isSlotUpcoming(candidate, now)),
      slot.id,
      service.duration,
    );
    if (!run) {
      throw new ConflictError("This service does not fit in the selected time slot");
    }

    const booking = await bookingRepository.createWithClaim(
      run.map((slotInRun) => slotInRun.id),
      {
        serviceId: service.id,
        clientName,
        clientPhone: input.clientPhone.trim(),
        clientEmail: input.clientEmail?.trim() || null,
      },
    );
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
