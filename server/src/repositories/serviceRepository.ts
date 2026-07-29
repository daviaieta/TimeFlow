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

  // Variante separada em vez de um include na de cima: o dashboard chama a
  // outra a cada carregamento e só precisa de id e nome — não vale pagar o
  // join lá para servir a tela de serviços.
  findManyByBusinessWithEmployees(businessId: number) {
    return prisma.service.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
      include: {
        employees: {
          orderBy: { employee: { name: "asc" } },
          select: { employee: { select: { id: true, name: true } } },
        },
      },
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
