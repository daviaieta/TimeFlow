import { prisma } from "../lib/prisma";

interface AvailabilityData {
  date: Date;
  startTime: string;
  endTime: string;
}

export const availabilityRepository = {
  findManyByEmployee(employeeId: number) {
    return prisma.availability.findMany({
      where: { employeeId },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
  },

  findById(id: number) {
    return prisma.availability.findUnique({ where: { id } });
  },

  findByUniqueSlot(employeeId: number, date: Date, startTime: string) {
    return prisma.availability.findUnique({
      where: { employeeId_date_startTime: { employeeId, date, startTime } },
    });
  },

  create(employeeId: number, data: AvailabilityData) {
    return prisma.availability.create({ data: { ...data, employeeId } });
  },

  update(id: number, data: AvailabilityData) {
    return prisma.availability.update({ where: { id }, data });
  },

  delete(id: number) {
    return prisma.availability.delete({ where: { id } });
  },
};
