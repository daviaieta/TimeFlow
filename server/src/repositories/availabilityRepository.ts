import { prisma } from "../lib/prisma";
import { AvailabilityData } from "../services/availabilityRules";

// O booking é o que distingue reserva de cliente externo (intocável) de
// encaixe manual (editável pelo dono).
const withBooking = { booking: { select: { id: true, clientName: true } } };

export const availabilityRepository = {
  findManyByEmployee(employeeId: number) {
    return prisma.availability.findMany({
      where: { employeeId },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: withBooking,
    });
  },

  findById(id: number) {
    return prisma.availability.findUnique({
      where: { id },
      include: withBooking,
    });
  },

  findManyFreeByEmployee(employeeId: number) {
    return prisma.availability.findMany({
      where: { employeeId, isBooked: false },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
  },

  findByIdForBooking(id: number) {
    return prisma.availability.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, name: true, businessId: true } },
      },
    });
  },

  findByUniqueSlot(employeeId: number, date: Date, startTime: string) {
    return prisma.availability.findUnique({
      where: { employeeId_date_startTime: { employeeId, date, startTime } },
    });
  },

  create(employeeId: number, data: AvailabilityData) {
    return prisma.availability.create({
      data: { ...data, employeeId },
      include: withBooking,
    });
  },

  update(id: number, data: AvailabilityData) {
    return prisma.availability.update({
      where: { id },
      data,
      include: withBooking,
    });
  },

  delete(id: number) {
    return prisma.availability.delete({ where: { id } });
  },
};
