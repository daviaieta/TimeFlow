import { CustomerIdentityState, CustomerLinkSource, Prisma } from "@prisma/client";
import {
  canLinkToExisting,
  claimableChannels,
  ExistingCustomer,
  fillMissingDisplayFields,
  mergeBookingTimestamps,
} from "../services/identityRules";

// Resolução de identidade do CRM. Todas as funções recebem o `tx` de fora e
// nenhuma abre transação própria: o vínculo tem que acontecer DENTRO da mesma
// transação que trava o horário, senão uma reserva confirmada poderia ficar sem
// prontuário (ou o contrário) quando algo falhasse no meio.
//
// Por que nada aqui usa try/catch em violação de unicidade: no Postgres, um
// erro dentro da transação a envenena — não dá para capturar o P2002 e seguir
// na mesma transação. Toda inserção que PODE colidir usa
// `createMany({ skipDuplicates: true })`, que é `ON CONFLICT DO NOTHING` e não
// levanta nada, seguida de uma releitura. É isso que torna o caminho seguro sob
// concorrência sem precisar de retry.

export interface BookingIdentityInput {
  businessId: number;
  clientName: string;
  // Já normalizados por identityRules. Null quando o cliente não deu o canal
  // ou quando o valor digitado não é reconhecível como canal.
  email: string | null;
  phoneE164: string | null;
  // O que o cliente digitou, para o cadastro que o negócio lê. Diferente do
  // normalizado de propósito: o negócio liga para o número como ele foi dado.
  displayPhone: string | null;
  displayEmail: string | null;
  bookedAt: Date;
  source: CustomerLinkSource;
  // Prontuário escolhido explicitamente no balcão (autocomplete do painel). Já
  // validado contra o tenant por quem chama. Quando vem preenchido, NÃO há o
  // que resolver: a atendente disse quem é o cliente, e adivinhar por canal em
  // cima disso só criaria chance de errar. Null no fluxo público, sempre.
  pinnedProfileId: number | null;
}

const EXISTING_SELECT = {
  id: true,
  state: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  mergedIntoId: true,
} as const;

async function isLinkedToBusiness(
  tx: Prisma.TransactionClient,
  customerId: number,
  businessId: number,
): Promise<boolean> {
  const profile = await tx.customerProfile.findUnique({
    where: { customerId_businessId: { customerId, businessId } },
    select: { id: true },
  });
  return profile !== null;
}

async function findLinkableByChannel(
  tx: Prisma.TransactionClient,
  where: Prisma.CustomerWhereInput,
  matchedBy: "EMAIL" | "PHONE",
  businessId: number,
): Promise<number | null> {
  const candidate: ExistingCustomer | null = await tx.customer.findFirst({
    where,
    select: EXISTING_SELECT,
  });
  if (!candidate) return null;

  const linkedHere = await isLinkedToBusiness(tx, candidate.id, businessId);
  return canLinkToExisting(candidate, matchedBy, linkedHere) ? candidate.id : null;
}

// Cria identidade sem canal nenhum reivindicado. Não tem coluna única
// preenchida, então não existe conflito possível: pode usar `create` e receber
// o id de volta. É a saída de emergência que garante que o fluxo SEMPRE termina
// — e que ele termina criando estado provisional isolado em vez de arriscar uma
// fusão errada.
function createIsolated(tx: Prisma.TransactionClient, name: string) {
  return tx.customer.create({
    data: { name, state: CustomerIdentityState.PROVISIONAL },
    select: { id: true },
  });
}

async function createClaiming(
  tx: Prisma.TransactionClient,
  name: string,
  email: string | null,
  phoneE164: string | null,
): Promise<number | null> {
  const inserted = await tx.customer.createMany({
    data: [{ name, email, phoneE164, state: CustomerIdentityState.PROVISIONAL }],
    skipDuplicates: true,
  });

  // Perdeu a corrida: entre a checagem de disponibilidade e este insert, outra
  // requisição reivindicou o canal. Quem chama reavalia.
  if (inserted.count === 0) return null;

  // createMany não devolve id. Buscar pelo canal que acabou de ser reivindicado
  // é seguro justamente porque ele é único e agora é nosso.
  const created = await tx.customer.findFirstOrThrow({
    where: email !== null ? { email } : { phoneE164 },
    select: { id: true },
  });
  return created.id;
}

// §4.1: a ordem importa e é a razão de o CRM ser seguro.
//
//   1. canal VERIFICADO (e-mail, depois telefone) — o único vínculo que
//      atravessa negócios;
//   2. identidade PROVISIONAL já ligada a ESTE negócio — o cliente de balcão
//      voltando, sem atravessar nada;
//   3. criar identidade nova, reivindicando só canal livre.
//
// Determinístico: os mesmos dados de entrada com o mesmo estado de banco
// escolhem sempre o mesmo caminho. Idempotente: chamar de novo para o mesmo
// cliente no mesmo negócio reencontra a identidade pelo passo 2.
async function resolveCustomerId(
  tx: Prisma.TransactionClient,
  input: BookingIdentityInput,
): Promise<number> {
  const { businessId, email, phoneE164 } = input;

  if (email !== null) {
    const byEmail = await findLinkableByChannel(
      tx,
      { email, emailVerifiedAt: { not: null } },
      "EMAIL",
      businessId,
    );
    if (byEmail !== null) return byEmail;
  }

  if (phoneE164 !== null) {
    const byPhone = await findLinkableByChannel(
      tx,
      { phoneE164, phoneVerifiedAt: { not: null } },
      "PHONE",
      businessId,
    );
    if (byPhone !== null) return byPhone;
  }

  // Passo 2. Escopado a ESTE negócio de propósito: dois cadastros de convidado
  // com o mesmo e-mail digitado em negócios diferentes seguem sendo identidades
  // separadas até alguém provar que é dono do e-mail.
  const channelMatches: Prisma.CustomerWhereInput[] = [];
  if (email !== null) channelMatches.push({ email });
  if (phoneE164 !== null) channelMatches.push({ phoneE164 });

  if (channelMatches.length > 0) {
    const linkedHere = await tx.customerProfile.findFirst({
      where: {
        businessId,
        customer: {
          state: CustomerIdentityState.PROVISIONAL,
          mergedIntoId: null,
          OR: channelMatches,
        },
      },
      select: { customerId: true },
    });
    if (linkedHere) return linkedHere.customerId;
  }

  // Passo 3. Reivindica só o que ninguém reivindicou.
  const [emailOwner, phoneOwner] = await Promise.all([
    email !== null
      ? tx.customer.findUnique({ where: { email }, select: { id: true } })
      : Promise.resolve(null),
    phoneE164 !== null
      ? tx.customer.findUnique({ where: { phoneE164 }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  const claimable = claimableChannels(
    email,
    phoneE164,
    emailOwner !== null,
    phoneOwner !== null,
  );

  if (claimable.email === null && claimable.phoneE164 === null) {
    const isolated = await createIsolated(tx, input.clientName);
    return isolated.id;
  }

  const created = await createClaiming(
    tx,
    input.clientName,
    claimable.email,
    claimable.phoneE164,
  );
  if (created !== null) return created;

  // Reavaliação única: o canal foi reivindicado no meio do caminho. Se o dono
  // novo é ligável (ficou ACTIVE e verificado, ou é provisional deste mesmo
  // negócio), liga; se não, cria isolado. Dois inserts no pior caso, e sempre
  // termina.
  for (const [channel, value] of [
    ["EMAIL", claimable.email],
    ["PHONE", claimable.phoneE164],
  ] as const) {
    if (value === null) continue;
    const linkable = await findLinkableByChannel(
      tx,
      channel === "EMAIL" ? { email: value } : { phoneE164: value },
      channel,
      businessId,
    );
    if (linkable !== null) return linkable;
  }

  const fallback = await createIsolated(tx, input.clientName);
  return fallback.id;
}

export const customerRepository = {
  // Resolve a identidade e garante o prontuário deste negócio. Roda ANTES do
  // claim do horário: se algo aqui falhar, o cliente perde a requisição, não o
  // horário.
  async linkForBooking(
    tx: Prisma.TransactionClient,
    input: BookingIdentityInput,
  ): Promise<{ customerId: number; profileId: number }> {
    // Atalho do balcão: prontuário já escolhido, resolução por canal não roda.
    // O `businessId` volta no predicado mesmo com o serviço já tendo conferido
    // — a trava de tenant vale no ponto da ESCRITA, não só na leitura que a
    // precedeu. `OrThrow` porque, hoje, nada apaga prontuário: se este SELECT
    // não encontra a linha, o estado é inesperado e abortar a transação (sem
    // reservar nada) é a resposta certa.
    if (input.pinnedProfileId !== null) {
      const pinned = await tx.customerProfile.findFirstOrThrow({
        where: { id: input.pinnedProfileId, businessId: input.businessId },
        select: { id: true, customerId: true },
      });
      return { customerId: pinned.customerId, profileId: pinned.id };
    }

    const customerId = await resolveCustomerId(tx, input);

    // Mesma técnica de sempre: o unique [customerId, businessId] absorve duas
    // primeiras reservas simultâneas do mesmo cliente sem levantar exceção
    // dentro da transação.
    await tx.customerProfile.createMany({
      data: [
        {
          customerId,
          businessId: input.businessId,
          source: input.source,
          displayName: input.clientName,
          displayPhone: input.displayPhone,
          displayEmail: input.displayEmail,
        },
      ],
      skipDuplicates: true,
    });

    const profile = await tx.customerProfile.findUniqueOrThrow({
      where: { customerId_businessId: { customerId, businessId: input.businessId } },
      select: { id: true },
    });

    return { customerId, profileId: profile.id };
  },

  // Contadores em cache do prontuário (§13.1): tela de cliente que faça
  // count(*) e sum(price) funciona com 200 reservas e para de funcionar quando
  // a lista mostra 50 clientes de uma vez.
  //
  // completedCount/noShowCount/canceledCount NÃO são tocados: o sistema não tem
  // ciclo de vida de reserva (Booking não tem status), então não existe evento
  // de conclusão para contar. Por consequência, totalSpent aqui é valor
  // RESERVADO, não valor liquidado — inclui quem não apareceu.
  async applyBookingToProfile(
    tx: Prisma.TransactionClient,
    profileId: number,
    priceAtBooking: Prisma.Decimal,
    bookedAt: Date,
    incoming: { phone: string | null; email: string | null },
  ): Promise<void> {
    const profile = await tx.customerProfile.findUniqueOrThrow({
      where: { id: profileId },
      select: {
        firstBookedAt: true,
        lastBookedAt: true,
        displayPhone: true,
        displayEmail: true,
      },
    });

    await tx.customerProfile.update({
      where: { id: profileId },
      data: {
        bookingsCount: { increment: 1 },
        totalSpent: { increment: priceAtBooking },
        ...mergeBookingTimestamps(profile, bookedAt),
        ...fillMissingDisplayFields(profile, incoming),
      },
    });
  },
};
