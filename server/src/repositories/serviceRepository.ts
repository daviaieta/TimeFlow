import { prisma } from "../lib/prisma";

interface ServiceData {
  name: string;
  duration: number;
  price: number;
}

export const serviceRepository = {
  findManyByBusiness(businessId: number) {
    return prisma.service.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });
  },

  findById(id: number) {
    return prisma.service.findUnique({ where: { id } });
  },

  create(businessId: number, data: ServiceData) {
    return prisma.service.create({
      data: {
        name: data.name,
        duration: data.duration,
        price: data.price,
        businessId,
      },
    });
  },

  update(id: number, data: ServiceData) {
    return prisma.service.update({
      where: { id },
      data: {
        name: data.name,
        duration: data.duration,
        price: data.price,
      },
    });
  },

  countBookings(serviceId: number) {
    return prisma.booking.count({ where: { serviceId } });
  },

  deleteWithEmployeeLinks(id: number) {
    return prisma.$transaction([
      prisma.employeeService.deleteMany({ where: { serviceId: id } }),
      prisma.service.delete({ where: { id } }),
    ]);
  },
};
