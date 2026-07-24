import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface CreateEmployeeInput {
  name: string;
  email: string;
  businessId: number;
  inviteToken: string;
  inviteTokenExpiresAt: Date;
}

export const employeeRepository = {
  findManyByBusiness(businessId: number) {
    return prisma.user.findMany({
      where: { businessId, role: Role.EMPLOYEE },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        services: {
          select: { service: { select: { id: true, name: true } } },
        },
      },
    });
  },

  findById(id: number) {
    return prisma.user.findUnique({ where: { id } });
  },

  create(data: CreateEmployeeInput) {
    return prisma.user.create({ data: { ...data, role: Role.EMPLOYEE } });
  },

  countBookedAvailabilities(employeeId: number) {
    return prisma.availability.count({ where: { employeeId, isBooked: true } });
  },

  deleteWithLinks(id: number) {
    return prisma.$transaction([
      prisma.employeeService.deleteMany({ where: { employeeId: id } }),
      prisma.availability.deleteMany({ where: { employeeId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);
  },

  linkService(employeeId: number, serviceId: number) {
    return prisma.employeeService.upsert({
      where: { employeeId_serviceId: { employeeId, serviceId } },
      create: { employeeId, serviceId },
      update: {},
    });
  },

  hasServiceLink(employeeId: number, serviceId: number) {
    return prisma.employeeService.findUnique({
      where: { employeeId_serviceId: { employeeId, serviceId } },
    });
  },

  unlinkService(employeeId: number, serviceId: number) {
    return prisma.employeeService.deleteMany({
      where: { employeeId, serviceId },
    });
  },
};
