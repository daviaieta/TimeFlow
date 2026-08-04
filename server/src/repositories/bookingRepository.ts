import { BookingSource, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { BookingIdentityInput, customerRepository } from "./customerRepository";

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
  //
  // `identity` só vem preenchido com o CRM ligado. A ordem dentro da transação
  // é a do §7 do documento e não é acidental: identidade ANTES do claim, para
  // que o claim continue sendo a última coisa que falha por razão de negócio —
  // trabalho de identidade nunca pode ser a causa de um horário perdido.
  createWithClaim(
    availabilityIds: number[],
    data: BookingData,
    identity?: BookingIdentityInput,
  ) {
    return prisma
      .$transaction(async (tx) => {
        const link = identity ? await customerRepository.linkForBooking(tx, identity) : null;

        const claimed = await tx.availability.updateMany({
          where: { id: { in: availabilityIds }, isBooked: false },
          data: { isBooked: true },
        });

        if (claimed.count !== availabilityIds.length) {
          throw new SlotTaken();
        }

        const booking = await tx.booking.create({
          data: { ...data, profileId: link?.profileId ?? null },
        });

        await tx.availability.updateMany({
          where: { id: { in: availabilityIds } },
          data: { bookingId: booking.id },
        });

        // Depois do insert de propósito: o agregado conta reserva que existe.
        if (link && identity) {
          await customerRepository.applyBookingToProfile(
            tx,
            link.profileId,
            data.priceAtBooking,
            identity.bookedAt,
            { phone: identity.displayPhone, email: identity.displayEmail },
          );
        }

        return booking;
      })
      .catch((error: unknown) => {
        if (error instanceof SlotTaken) return null;
        throw error;
      });
  },
};
