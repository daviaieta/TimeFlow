import { prisma } from "../lib/prisma";
import { AvailabilityData } from "../services/availabilityRules";

// O booking é o que determina se o slot é imutável: quando existe, o slot não
// pode ser editado ou removido. isBooked sozinho não é suficiente para esse check.
// Os campos do cliente e do serviço vêm junto porque a timeline monta o evento
// inteiro a partir do slot — sem eles seria uma segunda query por reserva.
const withBooking = {
  booking: {
    select: {
      id: true,
      clientName: true,
      clientPhone: true,
      clientEmail: true,
      service: { select: { id: true, name: true } },
    },
  },
};

export const availabilityRepository = {
  // Um dia por vez, sempre crescente: é exatamente o que a timeline desenha.
  findManyByEmployeeAndDate(employeeId: number, date: Date) {
    return prisma.availability.findMany({
      where: { employeeId, date },
      orderBy: { startTime: "asc" },
      include: withBooking,
    });
  },

  findById(id: number) {
    return prisma.availability.findUnique({
      where: { id },
      include: withBooking,
    });
  },

  findManyByEmployeeInRange(employeeId: number, from: Date, to: Date) {
    return prisma.availability.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
    });
  },

  createMany(
    employeeId: number,
    slots: { date: string; startTime: string; endTime: string }[],
  ) {
    return prisma.availability.createMany({
      data: slots.map((slot) => ({
        employeeId,
        date: new Date(slot.date),
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
      skipDuplicates: true, // backstop: @@unique([employeeId, date, startTime])
    });
  },

  findManyFreeByEmployee(employeeId: number) {
    return prisma.availability.findMany({
      where: { employeeId, isBooked: false },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
  },

  findManyFreeByBusiness(businessId: number, from: Date) {
    return prisma.availability.findMany({
      where: { isBooked: false, date: { gte: from }, employee: { businessId } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      // id e endTime entram porque o próximo horário do catálogo depende de
      // encadear slots livres até cobrir a duração do serviço.
      select: {
        id: true,
        employeeId: true,
        date: true,
        startTime: true,
        endTime: true,
      },
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
