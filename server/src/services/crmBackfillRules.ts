import { Prisma } from "@prisma/client";
import { normalizeEmail, normalizePhoneE164 } from "./identityRules";

// Decisões puras do backfill histórico (§8 fase 3). Nada aqui toca no banco.
//
// O backfill é a única parte do CRM que escreve em linha que já existia, então
// tudo que ele decide precisa ser determinístico: a mesma entrada com o mesmo
// estado de banco tem que produzir sempre o mesmo resultado, ou reexecutar
// depois de uma interrupção produziria um banco diferente do de uma execução
// única.

export type GroupKey =
  | { kind: "EMAIL"; value: string }
  | { kind: "PHONE"; value: string };

export interface BackfillBooking {
  id: number;
  createdAt: Date;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  priceAtBooking: Prisma.Decimal | null;
  servicePrice: Prisma.Decimal;
  // Necessário no agrupamento, e não só depois: o prontuário de um grupo é
  // descoberto por uma reserva do PRÓPRIO grupo que já esteja vinculada. Se o
  // agrupamento visse apenas as reservas soltas, uma execução interrompida no
  // meio de um grupo criaria um segundo prontuário para o mesmo contato na
  // reexecução — e pelo canal não há como achar o primeiro, porque ele pode
  // ter ficado nulo se outro negócio reivindicou antes.
  profileId: number | null;
}

// coalesce(e-mail normalizado, telefone normalizado), exatamente como o
// documento especifica. O NOME não entra: nome é sinal fraco — "Davi",
// "davi" e "Davi Silva" podem ser três pessoas, e agrupar por ele criaria
// associação inventada, que é justamente o que este backfill não pode fazer.
//
// Consequência aceita e registrada: uma reserva com e-mail e outra só com
// telefone, da MESMA pessoa no mesmo negócio, caem em grupos diferentes e
// geram dois prontuários. Isso é subvinculação — o lado seguro do erro. A
// alternativa (unir por qualquer canal em comum) uniria também duas pessoas
// que dividem um telefone, e desunir depois é impossível sem o log de fusão.
export function groupKeyFor(booking: BackfillBooking): GroupKey | null {
  const email = normalizeEmail(booking.clientEmail);
  if (email !== null) return { kind: "EMAIL", value: email };

  const phone = normalizePhoneE164(booking.clientPhone);
  if (phone !== null) return { kind: "PHONE", value: phone };

  // Sem canal reconhecível: fica sem resolver, de propósito. Ver §8 fase 3.
  return null;
}

export function serializeGroupKey(key: GroupKey): string {
  return `${key.kind}:${key.value}`;
}

export interface BookingGroup {
  key: GroupKey;
  bookings: BackfillBooking[];
}

export interface GroupingResult {
  groups: BookingGroup[];
  unresolved: BackfillBooking[];
}

// Ordem estável e explícita: os grupos saem ordenados pela chave serializada,
// e as reservas dentro de cada grupo por id. Sem isto, a ordem viria do
// Postgres, que não promete nenhuma — e como reivindicar um canal é uma
// corrida global entre negócios, ordem instável significaria resultado
// diferente a cada execução.
export function groupBookings(bookings: BackfillBooking[]): GroupingResult {
  const byKey = new Map<string, BookingGroup>();
  const unresolved: BackfillBooking[] = [];

  for (const booking of bookings) {
    const key = groupKeyFor(booking);
    if (key === null) {
      unresolved.push(booking);
      continue;
    }

    const serialized = serializeGroupKey(key);
    const existing = byKey.get(serialized);
    if (existing) {
      existing.bookings.push(booking);
    } else {
      byKey.set(serialized, { key, bookings: [booking] });
    }
  }

  const groups = [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]) => ({
      ...group,
      bookings: [...group.bookings].sort((a, b) => a.id - b.id),
    }));

  return { groups, unresolved: unresolved.sort((a, b) => a.id - b.id) };
}

// As reservas do grupo que ainda não têm prontuário. O resto do grupo entrou
// só para revelar qual prontuário é o do contato.
export function pendingBookings(group: BookingGroup): BackfillBooking[] {
  return group.bookings.filter((booking) => booking.profileId === null);
}

// O prontuário que este contato já tem neste negócio, se tiver. Determinístico:
// as reservas do grupo estão ordenadas por id, então em caso de mais de um
// vínculo (possível se a escrita ao vivo e uma execução anterior discordaram)
// ganha sempre o da reserva mais antiga.
export function existingProfileId(group: BookingGroup): number | null {
  return group.bookings.find((booking) => booking.profileId !== null)?.profileId ?? null;
}

export interface ProfileAggregate {
  bookingsCount: number;
  totalSpent: Prisma.Decimal;
  spendIsEstimated: boolean;
  firstBookedAt: Date | null;
  lastBookedAt: Date | null;
}

// Recalculado a partir das linhas, NUNCA incrementado. É isto que torna o
// backfill idempotente de verdade: rodar duas vezes sobre o mesmo prontuário
// produz o mesmo número, e uma execução interrompida no meio não deixa
// contador inflado.
//
// priceAtBooking nulo é reserva anterior à fase 0, que não tem retrato de
// preço. Ela entra na soma pelo preço ATUAL do serviço e marca o prontuário
// como estimado — o número é útil, mas o produto não pode apresentá-lo como
// exato, porque ele muda quando o negócio reajusta a tabela.
export function aggregateFromBookings(bookings: BackfillBooking[]): ProfileAggregate {
  let totalSpent = new Prisma.Decimal(0);
  let spendIsEstimated = false;
  let firstBookedAt: Date | null = null;
  let lastBookedAt: Date | null = null;

  for (const booking of bookings) {
    if (booking.priceAtBooking !== null) {
      totalSpent = totalSpent.add(booking.priceAtBooking);
    } else {
      totalSpent = totalSpent.add(booking.servicePrice);
      spendIsEstimated = true;
    }

    if (firstBookedAt === null || booking.createdAt < firstBookedAt) {
      firstBookedAt = booking.createdAt;
    }
    if (lastBookedAt === null || booking.createdAt > lastBookedAt) {
      lastBookedAt = booking.createdAt;
    }
  }

  return {
    bookingsCount: bookings.length,
    totalSpent,
    spendIsEstimated,
    firstBookedAt,
    lastBookedAt,
  };
}

// O nome que o prontuário mostra vem da reserva MAIS ANTIGA do grupo, não da
// mais recente: é uma escolha arbitrária entre dois valores igualmente
// plausíveis, e o critério fica registrado porque precisa ser o mesmo em toda
// execução. A equipe pode corrigir depois, e a correção sobrevive (§2.3).
export function displayFieldsFor(bookings: BackfillBooking[]): {
  displayName: string;
  displayPhone: string | null;
  displayEmail: string | null;
} {
  const oldest = bookings[0];
  return {
    displayName: oldest.clientName,
    displayPhone: oldest.clientPhone || null,
    // O primeiro e-mail que aparecer no grupo, na ordem por id. Num grupo
    // com chave de e-mail é sempre o mesmo valor; num grupo com chave de
    // telefone pode não haver nenhum.
    displayEmail: bookings.find((booking) => booking.clientEmail)?.clientEmail ?? null,
  };
}
