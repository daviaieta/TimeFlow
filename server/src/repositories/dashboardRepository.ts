import { prisma } from "../lib/prisma";

// Select enxuto de propósito: 90 dias × equipe inteira é dezenas de milhares
// de linhas, e nada além destes campos entra na agregação.
const slotSelect = {
  id: true,
  date: true,
  startTime: true,
  endTime: true,
  isBooked: true,
  employeeId: true,
  booking: {
    // O id é o que permite agrupar os slots de um serviço longo numa reserva
    // só — sem ele, receita e contagem saem dobradas. source distingue
    // reserva do site de reserva feita pela atendente no painel.
    select: {
      id: true,
      clientName: true,
      clientPhone: true,
      source: true,
      service: { select: { id: true, name: true, price: true } },
    },
  },
} as const;

export const dashboardRepository = {
  findSlotsInRange(businessId: number, from: Date, to: Date) {
    return prisma.availability.findMany({
      where: { employee: { businessId }, date: { gte: from, lt: to } },
      select: slotSelect,
    });
  },

  // Query separada da janela: "próximas reservas" é sempre o que vem agora,
  // independente do período que o dono selecionou.
  findUpcomingBooked(businessId: number, from: Date, take: number) {
    return prisma.availability.findMany({
      where: { employee: { businessId }, isBooked: true, date: { gte: from } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        employee: { select: { name: true } },
        booking: {
          select: {
            id: true,
            clientName: true,
            clientPhone: true,
            service: { select: { name: true } },
          },
        },
      },
    });
  },

  countBookingsCreatedBetween(businessId: number, from: Date, to: Date) {
    return prisma.booking.count({
      where: { service: { businessId }, createdAt: { gte: from, lt: to } },
    });
  },
};
