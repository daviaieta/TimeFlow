import { prisma } from "../lib/prisma";

interface BookingData {
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
}

export const bookingRepository = {
  // Claim atômico: só cria o Booking se ESTA transação virou o isBooked.
  // null = outro cliente levou o horário. O @unique de availabilityId é o
  // backstop no banco (P2002 → 409 no errorHandler).
  createWithClaim(availabilityId: number, data: BookingData) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.availability.updateMany({
        where: { id: availabilityId, isBooked: false },
        data: { isBooked: true },
      });

      if (claimed.count === 0) {
        return null;
      }

      return tx.booking.create({ data: { ...data, availabilityId } });
    });
  },
};
