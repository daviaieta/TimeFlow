import { CustomerIdentityState, CustomerLinkSource, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { BackfillBooking, GroupKey, ProfileAggregate } from "../services/crmBackfillRules";

// Acesso a banco do backfill. Toda função de escrita recebe o `tx` de fora:
// quem decide o tamanho da transação é o serviço, porque isso é a diferença
// entre "interrompível" (uma transação por grupo) e "simulação" (uma
// transação só, desfeita no fim).

const BOOKING_SELECT = {
  id: true,
  createdAt: true,
  clientName: true,
  clientPhone: true,
  clientEmail: true,
  priceAtBooking: true,
  profileId: true,
  service: { select: { price: true } },
} as const;

type RawBooking = {
  id: number;
  createdAt: Date;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  priceAtBooking: Prisma.Decimal | null;
  profileId: number | null;
  service: { price: Prisma.Decimal };
};

function toBackfillBooking(raw: RawBooking): BackfillBooking {
  return {
    id: raw.id,
    createdAt: raw.createdAt,
    clientName: raw.clientName,
    clientPhone: raw.clientPhone,
    clientEmail: raw.clientEmail,
    priceAtBooking: raw.priceAtBooking,
    servicePrice: raw.service.price,
    profileId: raw.profileId,
  };
}

export const crmBackfillRepository = {
  // Ordem ascendente e explícita: reivindicar e-mail e telefone é uma corrida
  // GLOBAL entre negócios (as colunas são únicas na plataforma), então quem é
  // processado primeiro fica com o canal. Ordem instável faria a mesma base
  // produzir resultados diferentes a cada execução, e o backfill deixaria de
  // ser determinístico.
  listBusinessIds(onlyBusinessId?: number): Promise<{ id: number }[]> {
    return prisma.business.findMany({
      where: onlyBusinessId ? { id: onlyBusinessId } : undefined,
      select: { id: true },
      orderBy: { id: "asc" },
    });
  },

  // TODAS as reservas do negócio, vinculadas ou não.
  //
  // Ler só as soltas seria mais barato e estaria errado: o prontuário que um
  // contato já tem é descoberto por uma reserva do mesmo grupo que já esteja
  // vinculada, e a chave do grupo depende de normalização feita em JavaScript —
  // o Postgres não sabe que "(11) 99999-8888" e "+5511999998888" são o mesmo
  // contato, então não há filtro em SQL que traga "as reservas do mesmo grupo".
  // O agrupamento tem que ver o histórico inteiro do negócio.
  async listBookingsForGrouping(businessId: number): Promise<BackfillBooking[]> {
    const rows = await prisma.booking.findMany({
      where: { businessId },
      select: BOOKING_SELECT,
      orderBy: { id: "asc" },
    });
    return rows.map(toBackfillBooking);
  },

  // Um canal só pode ser reivindicado por uma identidade na plataforma inteira.
  // Aqui só se pergunta se está livre; quem decide o que fazer é o serviço.
  async channelOwner(
    tx: Prisma.TransactionClient,
    key: GroupKey,
  ): Promise<{ id: number } | null> {
    return tx.customer.findUnique({
      where: key.kind === "EMAIL" ? { email: key.value } : { phoneE164: key.value },
      select: { id: true },
    });
  },

  createProvisionalCustomer(
    tx: Prisma.TransactionClient,
    data: { name: string; email: string | null; phoneE164: string | null },
  ) {
    return tx.customer.create({
      data: { ...data, state: CustomerIdentityState.PROVISIONAL },
      select: { id: true },
    });
  },

  createMigrationProfile(
    tx: Prisma.TransactionClient,
    data: {
      customerId: number;
      businessId: number;
      displayName: string;
      displayPhone: string | null;
      displayEmail: string | null;
    },
  ) {
    return tx.customerProfile.create({
      data: { ...data, source: CustomerLinkSource.MIGRATION },
      select: { id: true },
    });
  },

  // profileId: null no where é o que garante idempotência na escrita: uma
  // reserva já vinculada (por execução anterior ou pela escrita ao vivo da
  // fase 2) nunca é redirecionada. A contagem devolvida é quantas ESTA
  // execução realmente mexeu.
  async linkBookings(
    tx: Prisma.TransactionClient,
    bookingIds: number[],
    profileId: number,
  ): Promise<number> {
    const result = await tx.booking.updateMany({
      where: { id: { in: bookingIds }, profileId: null },
      data: { profileId },
    });
    return result.count;
  },

  // Lê TODAS as reservas do prontuário, não só as deste grupo: o agregado é
  // recalculado do zero, então precisa ver tudo que já está pendurado ali —
  // inclusive o que a escrita ao vivo da fase 2 pendurou.
  async listBookingsOfProfile(
    tx: Prisma.TransactionClient,
    profileId: number,
  ): Promise<BackfillBooking[]> {
    const rows = await tx.booking.findMany({
      where: { profileId },
      select: BOOKING_SELECT,
      orderBy: { id: "asc" },
    });
    return rows.map(toBackfillBooking);
  },

  async writeAggregate(
    tx: Prisma.TransactionClient,
    profileId: number,
    aggregate: ProfileAggregate,
  ): Promise<void> {
    await tx.customerProfile.update({
      where: { id: profileId },
      data: {
        bookingsCount: aggregate.bookingsCount,
        totalSpent: aggregate.totalSpent,
        spendIsEstimated: aggregate.spendIsEstimated,
        firstBookedAt: aggregate.firstBookedAt,
        lastBookedAt: aggregate.lastBookedAt,
      },
    });
  },
};
