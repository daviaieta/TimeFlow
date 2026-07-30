import { BookingSource, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface BookingData {
  serviceId: number;
  // Redundante com o negócio do serviço, e é o ponto: quem escreve a reserva
  // já sabe o tenant, então a coluna nasce preenchida em vez de depender de
  // um backfill contínuo.
  businessId: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  // Preço congelado no ato. Decimal do Prisma, não number: o valor vem de
  // Service.price e é repassado sem passar por float.
  priceAtBooking: Prisma.Decimal;
  source: BookingSource;
}

// Sinaliza claim perdido de dentro da transação: precisa ser exceção para o
// Prisma desfazer os slots que já haviam sido marcados nesta tentativa.
class SlotTaken extends Error {}

export const bookingRepository = {
  // Claim atômico do run inteiro: o updateMany só conta os slots que ESTA
  // transação virou de livre para ocupado. Se qualquer um do run já tinha
  // dono, a reserva inteira cai — meia reserva deixaria o serviço sem tempo
  // para terminar. null = outro cliente levou algum dos horários.
  createWithClaim(availabilityIds: number[], data: BookingData) {
    return prisma
      .$transaction(async (tx) => {
        const claimed = await tx.availability.updateMany({
          where: { id: { in: availabilityIds }, isBooked: false },
          data: { isBooked: true },
        });

        if (claimed.count !== availabilityIds.length) {
          throw new SlotTaken();
        }

        const booking = await tx.booking.create({ data });

        await tx.availability.updateMany({
          where: { id: { in: availabilityIds } },
          data: { bookingId: booking.id },
        });

        return booking;
      })
      .catch((error: unknown) => {
        if (error instanceof SlotTaken) return null;
        throw error;
      });
  },
};
