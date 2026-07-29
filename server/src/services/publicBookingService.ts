import { Role } from "@prisma/client";
import { NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";
import { businessRepository } from "../repositories/businessRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import { isSlotUpcoming, slotsFittingDuration } from "./bookingRules";
import { createBookingForBusiness } from "./bookingService";
import { imageService } from "./imageService";
import {
  buildBookingSummary,
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
      {
        name: business.name,
        slug: business.slug,
        address: business.address,
        logoUrl: imageService.imageUrl(business.logoKey),
        bannerUrl: imageService.imageUrl(business.bannerKey),
      },
      business.services.map((service) => ({
        id: service.id,
        name: service.name,
        duration: service.duration,
        price: service.price,
        employees: service.employees.map((link) => ({
          id: link.employee.id,
          name: link.employee.name,
          avatarUrl: imageService.imageUrl(link.employee.avatarKey),
        })),
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

    const result = await createBookingForBusiness(business.id, input, now, "ONLINE");

    return buildBookingSummary({
      businessName: business.name,
      service: result.service,
      employeeName: result.employeeName,
      slot: result.slot,
      clientName: result.clientName,
    });
  },
};
