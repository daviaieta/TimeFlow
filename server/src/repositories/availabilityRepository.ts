import { prisma } from "../lib/prisma";
import { AvailabilityData } from "../services/availabilityRules";

export type ScheduleDirection = "upcoming" | "past";

// Não exportado: não é regra de negócio, é só "de que lado de hoje" vira
// filtro do Prisma. countDates e findDatesPage compartilham a mesma escolha.
function sideOfToday(direction: ScheduleDirection, todayStart: Date) {
  return direction === "upcoming" ? { gte: todayStart } : { lt: todayStart };
}

// O booking é o que distingue reserva de cliente externo (intocável) de
// encaixe manual (editável pelo dono).
const withBooking = { booking: { select: { id: true, clientName: true } } };

export const availabilityRepository = {
  countDates(employeeId: number, direction: ScheduleDirection, todayStart: Date) {
    return prisma.availability
      .groupBy({
        by: ["date"],
        where: { employeeId, date: sideOfToday(direction, todayStart) },
      })
      .then((rows) => rows.length);
  },

  findDatesPage(
    employeeId: number,
    direction: ScheduleDirection,
    todayStart: Date,
    skip: number,
    take: number,
  ) {
    return prisma.availability.findMany({
      where: { employeeId, date: sideOfToday(direction, todayStart) },
      distinct: ["date"],
      orderBy: { date: direction === "upcoming" ? "asc" : "desc" },
      skip,
      take,
      select: { date: true },
    });
  },

  // Sempre crescente, nos dois modos: quem decide se os DIAS aparecem em
  // ordem inversa (aba Passados) é o front, na exibição — os horários DENTRO
  // de cada dia continuam crescentes nos dois casos.
  findManyByEmployeeForDates(employeeId: number, dates: Date[]) {
    return prisma.availability.findMany({
      where: { employeeId, date: { in: dates } },
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
