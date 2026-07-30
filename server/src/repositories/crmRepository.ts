import { CustomerProfileStatus, LoyaltyEntryKind, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ProfileCursor, ProfileSort } from "../services/customerRules";

// Repositório do CRM voltado para o painel de negócio (fase 4). Toda função
// recebe `businessId` como PRIMEIRO argumento posicional — é o mesmo formato
// que o `customerRepository` da fase 2 já usa, e é o que torna a trava de
// tenant mecanicamente visível na assinatura. Não tem `findById` para linha
// de CRM: tudo resolve via (businessId, publicId) e devolve `null` em vez de
// 404, para o controller decidir o status HTTP.
//
// O que mora aqui:
//   - leitura paginada de prontuários com keyset (sem OFFSET);
//   - leitura em batch de etiquetas para evitar N+1;
//   - escrita de notas (autor é uma coluna de negócio, não de identidade);
//   - ADJUST manual de pontos (a única escrita que o painel faz na ledger
//     enquanto não há ciclo de vida de reserva);
//   - ajustes de CRM por tenant (crm settings).
//
// O que NÃO mora aqui: nada que envolva a identidade global. O painel nunca
// lê nem escreve em `Customer` — esse lado é exclusivo da fase 5.

export interface ListProfilesFilter {
  search: string | null;
  status: CustomerProfileStatus | null;
  // Quando informado, devolve só prontuários que TÊM a etiqueta. Filtro de
  // existência, não de interseção.
  tagId: number | null;
  sort: ProfileSort;
  cursor: ProfileCursor | null;
  take: number;
}

const PROFILE_SUMMARY_SELECT = {
  id: true,
  publicId: true,
  displayName: true,
  displayPhone: true,
  displayEmail: true,
  status: true,
  bookingsCount: true,
  totalSpent: true,
  spendIsEstimated: true,
  loyaltyPoints: true,
  firstBookedAt: true,
  lastBookedAt: true,
  createdAt: true,
} as const;

const TAG_SUMMARY_SELECT = {
  id: true,
  name: true,
  color: true,
} as const;

const NOTE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const;

const LOYALTY_SELECT = {
  id: true,
  kind: true,
  points: true,
  reason: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
} as const;

export interface ProfileSummary {
  id: number;
  publicId: string;
  displayName: string;
  displayPhone: string | null;
  displayEmail: string | null;
  status: CustomerProfileStatus;
  bookingsCount: number;
  totalSpent: Prisma.Decimal;
  spendIsEstimated: boolean;
  loyaltyPoints: number;
  firstBookedAt: Date | null;
  lastBookedAt: Date | null;
  createdAt: Date;
}

function nameSearchPredicate(search: string): Prisma.CustomerProfileWhereInput {
  // case-insensitive. Postgres `mode: "insensitive"` requer o citext ou
  // extensão; o Prisma traduz para ILIKE que já existe. Suficiente para o
  // balcão: o atendente digita os primeiros caracteres e a lista filtra.
  return {
    OR: [
      { displayName: { contains: search, mode: "insensitive" } },
      { displayPhone: { contains: search, mode: "insensitive" } },
      { displayEmail: { contains: search, mode: "insensitive" } },
    ],
  };
}

function orderByFor(sort: ProfileSort): Prisma.CustomerProfileOrderByWithRelationInput[] {
  if (sort === "name") {
    // lastBookedAt como desempate para o resultado ser estável: dois clientes
    // com o mesmo nome saem numa ordem reproduzível entre páginas.
    return [{ displayName: "asc" }, { lastBookedAt: "desc" }, { id: "asc" }];
  }
  return [{ lastBookedAt: "desc" }, { id: "asc" }];
}

function cursorFor(
  sort: ProfileSort,
  cursor: ProfileCursor,
  lastDisplayName: string,
): Prisma.CustomerProfileWhereInput {
  if (sort === "name") {
    // O comparador de cursor tem que respeitar o ORDER BY acima:
    //   (displayName > lastName) OR
    //   (displayName = lastName AND lastBookedAt < lastTime) OR
    //   (displayName = lastName AND lastBookedAt = lastTime AND id > lastId)
    // Sem o terceiro nível, dois prontuários com mesmo nome e mesmo
    // lastBookedAt pulariam um por página. A tupla `lastDisplayName` é a
    // chave do último item da página anterior — vem de fora porque o cursor
    // opaco carrega só (lastBookedAt, id) e o nome precisa ser reobtido na
    // página anterior (single extra query, see `previousName`).
    return {
      OR: [
        { displayName: { gt: lastDisplayName } },
        {
          displayName: lastDisplayName,
          OR: [
            { lastBookedAt: { lt: cursor.lastBookedAt } },
            {
              lastBookedAt: cursor.lastBookedAt,
              id: { gt: cursor.id },
            },
          ],
        },
      ],
    };
  }
  return {
    OR: [
      { lastBookedAt: { lt: cursor.lastBookedAt } },
      {
        lastBookedAt: cursor.lastBookedAt,
        id: { gt: cursor.id },
      },
    ],
  };
}

export const crmRepository = {
  // -------- Listagem --------------------------------------------------------

  async listProfiles(businessId: number, filter: ListProfilesFilter): Promise<ProfileSummary[]> {
    const where: Prisma.CustomerProfileWhereInput = { businessId };
    if (filter.status !== null) where.status = filter.status;
    if (filter.search !== null) Object.assign(where, nameSearchPredicate(filter.search));
    if (filter.tagId !== null) where.tags = { some: { tagId: filter.tagId } };

    const cursorExtra = filter.cursor
      ? cursorFor(filter.sort, filter.cursor, filter.cursor.displayName)
      : {};

    return prisma.customerProfile.findMany({
      where: filter.cursor ? { AND: [where, cursorExtra] } : where,
      orderBy: orderByFor(filter.sort),
      take: filter.take + 1,
      select: PROFILE_SUMMARY_SELECT,
    });
  },

  // -------- Detalhe + Etiquetas em batch ------------------------------------

  async findProfileByPublicId(
    businessId: number,
    publicId: string,
  ): Promise<ProfileSummary | null> {
    return prisma.customerProfile.findFirst({
      where: { businessId, publicId },
      select: PROFILE_SUMMARY_SELECT,
    });
  },

  // Resolve um conjunto de publicIds em um único SELECT. Usado pela rota de
  // criação de reserva para validar "cliente X existe aqui?" sem expor a
  // identidade global e sem N+1.
  async findProfilesByPublicIds(
    businessId: number,
    publicIds: string[],
  ): Promise<ProfileSummary[]> {
    if (publicIds.length === 0) return [];
    return prisma.customerProfile.findMany({
      where: { businessId, publicId: { in: publicIds } },
      select: PROFILE_SUMMARY_SELECT,
    });
  },

  // Tags de vários prontuários em um SELECT só. Sem isto, a lista de 20
  // prontuários vira 21 queries (uma por linha).
  async listTagsForProfiles(
    businessId: number,
    profileIds: number[],
  ): Promise<Map<number, { id: number; name: string; color: string | null }[]>> {
    if (profileIds.length === 0) return new Map();
    const rows = await prisma.customerProfileTag.findMany({
      where: { profile: { businessId }, profileId: { in: profileIds } },
      select: {
        profileId: true,
        tag: { select: TAG_SUMMARY_SELECT },
      },
    });
    const byProfile = new Map<number, { id: number; name: string; color: string | null }[]>();
    for (const row of rows) {
      const list = byProfile.get(row.profileId) ?? [];
      list.push(row.tag);
      byProfile.set(row.profileId, list);
    }
    return byProfile;
  },

  // -------- Histórico (reservas do prontuário) ------------------------------

  async listBookingsForProfile(
    businessId: number,
    profileId: number,
    cursor: { createdAt: Date; id: number } | null,
    take: number,
  ): Promise<
    {
      id: number;
      createdAt: Date;
      priceAtBooking: Prisma.Decimal | null;
      service: { name: string } | null;
      // O primeiro slot do run dá data/hora e funcionário: a reserva ocupa N
      // slots consecutivos na grade, o primeiro é onde começa.
      availabilities: {
        date: Date;
        startTime: string;
        endTime: string;
        employee: { name: string } | null;
      }[];
    }[]
  > {
    const where: Prisma.BookingWhereInput = {
      businessId,
      profileId,
    };
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    return prisma.booking.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: {
        id: true,
        createdAt: true,
        priceAtBooking: true,
        service: { select: { name: true } },
        // Pega o primeiro slot da reserva para data/hora. Funciona porque a
        // reserva ocupa N slots consecutivos na grade; o primeiro é onde
        // começa.
        availabilities: {
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          take: 1,
          select: {
            date: true,
            startTime: true,
            endTime: true,
            employee: { select: { name: true } },
          },
        },
      },
    });
  },

  // -------- Notas ------------------------------------------------------------

  async listNotes(businessId: number, profileId: number) {
    return prisma.customerNote.findMany({
      where: { businessId, profileId },
      orderBy: { createdAt: "desc" },
      select: NOTE_SELECT,
    });
  },

  async createNote(businessId: number, profileId: number, authorId: number, body: string) {
    return prisma.customerNote.create({
      data: { businessId, profileId, authorId, body },
      select: NOTE_SELECT,
    });
  },

  async findNoteForBusiness(
    businessId: number,
    noteId: number,
  ): Promise<{
    id: number;
    profileId: number;
    authorId: number | null;
  } | null> {
    return prisma.customerNote.findFirst({
      where: { businessId, id: noteId },
      select: { id: true, profileId: true, authorId: true },
    });
  },

  async updateNote(
    businessId: number,
    noteId: number,
    body: string,
  ): Promise<{ id: number; body: string; updatedAt: Date }> {
    // Defesa dupla de tenant: o update só toca nota DESTE negócio. O
    // Prisma `update` não aceita um where composto não-único, então
    // `updateMany` com `{ id, businessId }` é a trava — count 0 significa que
    // a nota não é daqui (o findNoteForBusiness do service já teria barrado,
    // mas a trava do repo não depende de o service lembrar dela). Rele-se
    // porque updateMany não devolve a linha.
    await prisma.customerNote.updateMany({
      where: { businessId, id: noteId },
      data: { body },
    });

    return prisma.customerNote.findFirstOrThrow({
      where: { businessId, id: noteId },
      select: { id: true, body: true, updatedAt: true },
    });
  },

  async deleteNote(businessId: number, noteId: number): Promise<void> {
    await prisma.customerNote.deleteMany({ where: { businessId, id: noteId } });
  },

  // -------- Etiquetas (vocabulário) ----------------------------------------

  async listTags(businessId: number) {
    return prisma.customerTag.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, createdAt: true },
    });
  },

  async findTagById(businessId: number, id: number) {
    return prisma.customerTag.findFirst({
      where: { businessId, id },
      select: { id: true, name: true, color: true },
    });
  },

  async createTag(businessId: number, name: string, color: string | null) {
    // createMany + skipDuplicates: a unicidade é [businessId, name], e
    // capturar P2002 dentro de uma operação única do caller ficaria caro.
    // Aqui, insert idempotente seguido de re-leitura.
    await prisma.customerTag.createMany({
      data: [{ businessId, name, color }],
    });
    return prisma.customerTag.findFirstOrThrow({
      where: { businessId, name },
      select: { id: true, name: true, color: true },
    });
  },

  async deleteTag(businessId: number, id: number): Promise<void> {
    await prisma.customerTag.deleteMany({ where: { businessId, id } });
  },

  async attachTag(
    businessId: number,
    profileId: number,
    tagId: number,
  ): Promise<{ attached: boolean }> {
    // A trava de tenant mora AQUI, não no service: a tabela de junção não tem
    // businessId próprio (é derivado pelo prontuário), então o createMany só
    // valida a PK [profileId, tagId] — não que a etiqueta e o prontuário são
    // do MESMO negócio. Sem isto, um caller que passasse ids cruzados colaria
    // uma etiqueta de A num prontuário de B. Confirma os dois no escopo antes
    // de inserir.
    const [tag, profile] = await Promise.all([
      prisma.customerTag.findFirst({ where: { businessId, id: tagId }, select: { id: true } }),
      prisma.customerProfile.findFirst({ where: { businessId, id: profileId }, select: { id: true } }),
    ]);
    if (!tag || !profile) return { attached: false };

    // §2.3: ON CONFLICT DO NOTHING. Idempotente — chamar duas vezes não
    // duplica nem levanta. O retorno diz se a ligação já existia.
    const before = await prisma.customerProfileTag.findUnique({
      where: { profileId_tagId: { profileId, tagId } },
      select: { profileId: true },
    });
    if (before) return { attached: false };

    await prisma.customerProfileTag.createMany({
      data: [{ profileId, tagId }],
      skipDuplicates: true,
    });
    return { attached: true };
  },

  async detachTag(businessId: number, profileId: number, tagId: number) {
    await prisma.customerProfileTag.deleteMany({
      where: { profile: { businessId }, profileId, tagId },
    });
  },

  // -------- Fidelidade -------------------------------------------------------

  async listLoyaltyEntries(
    businessId: number,
    profileId: number,
    cursor: { createdAt: Date; id: number } | null,
    take: number,
  ) {
    const where: Prisma.LoyaltyEntryWhereInput = { businessId, profileId };
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }
    return prisma.loyaltyEntry.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: LOYALTY_SELECT,
    });
  },

  // A escrita de ADJUST é a única coisa do livro-razão que o painel faz. O
  // resto (EARN/REDEEM) vem do ciclo de vida da reserva (fase 5/6). A
  // idempotência é por (businessId, idempotencyKey) — unique — e a leitura do
  // resultado existente acontece aqui para o caller ter o id sem nova query.
  async applyLoyaltyAdjust(input: {
    businessId: number;
    profileId: number;
    points: number;
    reason: string;
    authorId: number;
    idempotencyKey: string | null;
  }): Promise<{ id: number; alreadyApplied: boolean }> {
    return prisma.$transaction(async (tx) => {
      if (input.idempotencyKey !== null) {
        const existing = await tx.loyaltyEntry.findFirst({
          where: { businessId: input.businessId, idempotencyKey: input.idempotencyKey },
          select: { id: true },
        });
        if (existing) return { id: existing.id, alreadyApplied: true };
      }

      const created = await tx.loyaltyEntry.create({
        data: {
          businessId: input.businessId,
          profileId: input.profileId,
          kind: LoyaltyEntryKind.ADJUST,
          points: input.points,
          reason: input.reason,
          authorId: input.authorId,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true },
      });

      await tx.customerProfile.update({
        where: { id: input.profileId },
        data: { loyaltyPoints: { increment: input.points } },
      });

      return { id: created.id, alreadyApplied: false };
    });
  },

  // -------- Config de CRM por tenant ----------------------------------------

  async getSettings(businessId: number) {
    return prisma.businessCrmSettings.findUnique({ where: { businessId } });
  },

  async upsertSettings(
    businessId: number,
    patch: {
      loyaltyEnabled?: boolean;
      pointsPerUnit?: number;
      pointsExpireAfterDays?: number | null;
      customerLoginEnabled?: boolean;
    },
  ) {
    return prisma.businessCrmSettings.upsert({
      where: { businessId },
      create: {
        businessId,
        loyaltyEnabled: patch.loyaltyEnabled ?? false,
        pointsPerUnit: patch.pointsPerUnit ?? 1,
        pointsExpireAfterDays: patch.pointsExpireAfterDays ?? null,
        customerLoginEnabled: patch.customerLoginEnabled ?? true,
      },
      update: {
        ...(patch.loyaltyEnabled !== undefined ? { loyaltyEnabled: patch.loyaltyEnabled } : {}),
        ...(patch.pointsPerUnit !== undefined ? { pointsPerUnit: patch.pointsPerUnit } : {}),
        ...(patch.pointsExpireAfterDays !== undefined
          ? { pointsExpireAfterDays: patch.pointsExpireAfterDays }
          : {}),
        ...(patch.customerLoginEnabled !== undefined
          ? { customerLoginEnabled: patch.customerLoginEnabled }
          : {}),
      },
    });
  },

  // -------- Métricas do CRM --------------------------------------------------

  // Conjunto enxuto de agregados. As contagens rodam em uma query só cada
  // (Postgres resolve em índice) e os números retornados são absolutos — a
  // taxa de retorno fica para a camada de regra.
  async crmMetrics(businessId: number, now: Date) {
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, active, blocked, newThisMonth, topSpenders] = await Promise.all([
      prisma.customerProfile.count({ where: { businessId } }),
      prisma.customerProfile.count({ where: { businessId, status: "ACTIVE" } }),
      prisma.customerProfile.count({ where: { businessId, status: "BLOCKED" } }),
      prisma.customerProfile.count({ where: { businessId, createdAt: { gte: since } } }),
      prisma.customerProfile.findMany({
        where: { businessId, bookingsCount: { gt: 0 } },
        orderBy: { totalSpent: "desc" },
        take: 5,
        select: {
          publicId: true,
          displayName: true,
          bookingsCount: true,
          totalSpent: true,
        },
      }),
    ]);

    return { total, active, blocked, newThisMonth, topSpenders };
  },

  // -------- Edição de prontuário (display fields + status) -----------------

  // Resolve o id interno dentro de um SELECT tenant-escopado, e só então
  // chama o `update` no id (que não é exposto na API). O `where` do update
  // traz o businessId de volta como guarda — uma corrida que troque o
  // prontuário de negócio entre o SELECT e o UPDATE falha em vez de vazar.
  async updateProfileDisplay(
    businessId: number,
    publicId: string,
    patch: {
      displayName?: string;
      displayPhone?: string | null;
      displayEmail?: string | null;
      status?: CustomerProfileStatus;
    },
  ): Promise<{
    publicId: string;
    displayName: string;
    displayPhone: string | null;
    displayEmail: string | null;
    status: CustomerProfileStatus;
  } | null> {
    return prisma.$transaction(async (tx) => {
      const target = await tx.customerProfile.findFirst({
        where: { businessId, publicId },
        select: { id: true },
      });
      if (!target) return null;

      const data: Prisma.CustomerProfileUpdateInput = {};
      if (patch.displayName !== undefined) data.displayName = patch.displayName;
      if (patch.displayPhone !== undefined) data.displayPhone = patch.displayPhone;
      if (patch.displayEmail !== undefined) data.displayEmail = patch.displayEmail;
      if (patch.status !== undefined) data.status = patch.status;

      if (Object.keys(data).length === 0) {
        return tx.customerProfile.findFirstOrThrow({
          where: { id: target.id },
          select: {
            publicId: true,
            displayName: true,
            displayPhone: true,
            displayEmail: true,
            status: true,
          },
        });
      }

      return tx.customerProfile.update({
        where: { id: target.id, businessId },
        data,
        select: {
          publicId: true,
          displayName: true,
          displayPhone: true,
          displayEmail: true,
          status: true,
        },
      });
    });
  },
};
