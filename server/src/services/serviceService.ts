import { Service } from "@prisma/client";
import { ConflictError, NotFoundError } from "../lib/errors";
import { serviceRepository } from "../repositories/serviceRepository";

interface ServiceInput {
  name: string;
  duration: number;
  price: number;
}

async function findOwnedService(businessId: number, id: number): Promise<Service> {
  const service = await serviceRepository.findById(id);
  if (!service || service.businessId !== businessId) {
    throw new NotFoundError("Service not found");
  }

  return service;
}

export const serviceService = {
  listServices(businessId: number) {
    return serviceRepository.findManyByBusiness(businessId);
  },

  createService(businessId: number, input: ServiceInput) {
    return serviceRepository.create(businessId, input);
  },

  async updateService(businessId: number, id: number, input: ServiceInput) {
    await findOwnedService(businessId, id);
    return serviceRepository.update(id, input);
  },

  async deleteService(businessId: number, id: number) {
    await findOwnedService(businessId, id);

    const bookings = await serviceRepository.countBookings(id);
    if (bookings > 0) {
      throw new ConflictError("This service has bookings and cannot be deleted");
    }

    await serviceRepository.deleteWithEmployeeLinks(id);
  },
};
