import { CustomerProfileStatus, Prisma, Role } from "@prisma/client";
import { crmRepository, ListProfilesFilter, ProfileSummary } from "../repositories/crmRepository";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors";
import {
  BookingCursor,
  ProfileCursor,
  ProfileSort,
  clampPageSize,
  decodeBookingCursor,
  decodeProfileCursor,
  encodeBookingCursor,
  encodeProfileCursor,
  parseProfileSort,
  parseProfileStatus,
} from "./customerRules";
import { Note } from "@prisma/client";

// Serviço do CRM de negócio (fase 4). Thin: a lógica de decisão pura mora em
// customerRules, o acesso a dado mora em crmRepository. Aqui só fica o que
// precisa juntar os dois — foremost o keyset, que vira opaco na borda da API e
// interno no repositório.
//
// Invariante de tenant aqui, na borda: TODO parâmetro de "qual cliente" entra
// como publicId e é resolvido DENTRO do escopo de businessId. Um publicId que
// pertence a outro negócio vira 404 — nunca 403, porque 403 confirma que a
// linha existe e só não é sua, e descobrir isso já é a correlação que a
// promessa do produto proíbe (§11.4).

// O cursor vem opaco do cliente; o repositório quer a tupla. Decodificar é
// regra pura, mas a escolha de virar erro 400 (não 422, não 500) é daqui:
// rules não importam a camada de erro para continuarem testáveis sem Prisma.
function decodeProfileCursorOrThrow(raw: string | null): ProfileCursor | null {
  if (raw === null) return null;
  try {
    return decodeProfileCursor(raw);
  } catch {
    throw new BadRequestError("Invalid cursor");
  }
}

function decodeBookingCursorOrThrow(raw: string | null): BookingCursor | null {
  if (raw === null) return null;
  try {
    return decodeBookingCursor(raw);
  } catch {
    throw new BadRequestError("Invalid cursor");
  }
}

// Rasga os campos de uma página e produz o cursor opaco do ÚLTIMO item — ou
// null quando não há próxima página. O "último item" é o take-ésimo (não o
// take+1 que o repositório busca a mais só para saber se há próximos).
function profileNextCursor(page: ProfileSummary[], hasNext: boolean): string | null {
  if (!hasNext) return null;
  const last = page[page.length - 1];
  // lastBookedAt é null só para prontuário sem reserva — invariante do produto
  // (prontuário nasce junto com a primeira reserva, na mesma transação). Se
  // aparecer, Date(0) o manda para o topo da ordenação DESC consistentemente em
  // vez de quebrar a codificação.
  return encodeProfileCursor({
    lastBookedAt: last.lastBookedAt ?? new Date(0),
    id: last.id,
    displayName: last.displayName,
  });
}

export interface ListProfilesInput {
  businessId: number;
  search: string | null;
  status: CustomerProfileStatus | null;
  tagId: number | null;
  sort: ProfileSort;
  cursorRaw: string | null;
  limit?: number;
}

// Decimal não cruza o fio como number: float perde a precisão que justifica ele
// existir. Vai como string — o front faz Number() quando for exibir, e a
// trilha de auditoria (LoyaltyEntry / totalSpent) nunca passa por float.
export interface ProfileApi {
  publicId: string;
  displayName: string;
  displayPhone: string | null;
  displayEmail: string | null;
  status: CustomerProfileStatus;
  bookingsCount: number;
  totalSpent: string;
  spendIsEstimated: boolean;
  loyaltyPoints: number;
  firstBookedAt: string | null;
  lastBookedAt: string | null;
  createdAt: string;
  tags: { id: number; name: string; color: string | null }[];
}

function toProfileApi(
  profile: ProfileSummary,
  tags: { id: number; name: string; color: string | null }[],
): ProfileApi {
  return {
    publicId: profile.publicId,
    displayName: profile.displayName,
    displayPhone: profile.displayPhone,
    displayEmail: profile.displayEmail,
    status: profile.status,
    bookingsCount: profile.bookingsCount,
    totalSpent: profile.totalSpent.toString(),
    spendIsEstimated: profile.spendIsEstimated,
    loyaltyPoints: profile.loyaltyPoints,
    firstBookedAt: profile.firstBookedAt ? profile.firstBookedAt.toISOString() : null,
    lastBookedAt: profile.lastBookedAt ? profile.lastBookedAt.toISOString() : null,
    createdAt: profile.createdAt.toISOString(),
    tags,
  };
}

export interface BookingApi {
  id: number;
  createdAt: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  serviceName: string | null;
  employeeName: string | null;
  priceAtBooking: string | null;
}

// A reserva pega só o primeiro slot (o início do run) para data/hora/funcionário.
// Vem como array de 1 do repo; achata aqui para a API.
function toBookingApi(booking: {
  id: number;
  createdAt: Date;
  priceAtBooking: Prisma.Decimal | null;
  service: { name: string } | null;
  availabilities: {
    date: Date;
    startTime: string;
    endTime: string;
    employee: { name: string } | null;
  }[];
}): BookingApi {
  const first = booking.availabilities[0];
  return {
    id: booking.id,
    createdAt: booking.createdAt.toISOString(),
    date: first ? first.date.toISOString() : null,
    startTime: first ? first.startTime : null,
    endTime: first ? first.endTime : null,
    serviceName: booking.service?.name ?? null,
    employeeName: first?.employee?.name ?? null,
    priceAtBooking: booking.priceAtBooking ? booking.priceAtBooking.toString() : null,
  };
}

// Nota do cliente
export interface NoteApi {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: number; name: string } | null;
}

// Tag do cliente
export interface TagApi {
  id: number;
  name: string;
  color: string | null;
  createdAt: string;
}

export const crmService = {
  // -------- Listagem --------------------------------------------------------

  async listProfiles(input: ListProfilesInput): Promise<{
    profiles: ProfileApi[];
    nextCursor: string | null;
  }> {
    const cursor = decodeProfileCursorOrThrow(input.cursorRaw);

    const filter: ListProfilesFilter = {
      search: input.search,
      status: input.status,
      tagId: input.tagId,
      sort: input.sort,
      cursor,
      take: clampPageSize(input.limit),
    };

    const rows = await crmRepository.listProfiles(input.businessId, filter);
    const hasNext = rows.length > filter.take;
    const page = hasNext ? rows.slice(0, filter.take) : rows;

    // Tags em batch: um SELECT só para a página toda (§13.4). Sem isto, 20
    // prontuários virariam 21 queries.
    const tagsByProfile = await crmRepository.listTagsForProfiles(
      input.businessId,
      page.map((profile) => profile.id),
    );

    const profiles = page.map((profile) =>
      toProfileApi(profile, tagsByProfile.get(profile.id) ?? []),
    );

    return { profiles, nextCursor: profileNextCursor(page, hasNext) };
  },

  // -------- Detalhe ----------------------------------------------------------

  async getProfile(
    businessId: number,
    publicId: string,
  ): Promise<ProfileApi> {
    const profile = await crmRepository.findProfileByPublicId(businessId, publicId);
    if (!profile) throw new NotFoundError("Customer not found");

    const tagsByProfile = await crmRepository.listTagsForProfiles(businessId, [profile.id]);
    return toProfileApi(profile, tagsByProfile.get(profile.id) ?? []);
  },

  // -------- Histórico de reservas --------------------------------------------

  async listBookings(
    businessId: number,
    publicId: string,
    cursorRaw: string | null,
    limit?: number,
  ): Promise<{
    bookings: BookingApi[];
    nextCursor: string | null;
  }> {
    const profile = await crmRepository.findProfileByPublicId(businessId, publicId);
    // Mesma regra que o detalhe: publicId de outro negócio é 404, não 403.
    if (!profile) throw new NotFoundError("Customer not found");

    const cursor = decodeBookingCursorOrThrow(cursorRaw);
    const take = clampPageSize(limit);

    const rows = await crmRepository.listBookingsForProfile(
      businessId,
      profile.id,
      cursor,
      take,
    );
    const hasNext = rows.length > take;
    const page = hasNext ? rows.slice(0, take) : rows;

    const nextCursor =
      hasNext && page.length > 0
        ? encodeBookingCursor({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id })
        : null;

    return {
      bookings: page.map((booking) => toBookingApi(booking)),
      nextCursor,
    };
  },

  // -------- Notas ------------------------------------------------------------

  async listNotes(
    businessId: number,
    publicId: string,
  ): Promise<NoteApi[]> {
    const profile = await crmRepository.findProfileByPublicId(businessId, publicId);
    if (!profile) throw new NotFoundError("Customer not found");

    const notes = await crmRepository.listNotes(businessId, profile.id);
    return notes.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      author: note.author
        ? { id: note.author.id, name: note.author.name }
        : null,
    }));
  },

  async createNote(
    businessId: number,
    publicId: string,
    userId: number,
    body: string,
  ): Promise<NoteApi> {
    const profile = await crmRepository.findProfileByPublicId(businessId, publicId);
    if (!profile) throw new NotFoundError("Customer not found");

    const note = await crmRepository.createNote(businessId, profile.id, userId, body);
    return {
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      author: note.author
        ? { id: note.author.id, name: note.author.name }
        : null,
    };
  },

  async updateNote(
    businessId: number,
    publicId: string,
    noteId: number,
    userId: number,
    userRole: Role,
    body: string,
  ): Promise<NoteApi> {
    const profile = await crmRepository.findProfileByPublicId(businessId, publicId);
    if (!profile) throw new NotFoundError("Customer not found");

    const note = await crmRepository.findNoteForBusiness(businessId, noteId);
    if (!note) throw new NotFoundError("Note not found");
    // Allow update if the user is the author OR an admin
    if (note.authorId !== userId && userRole !== Role.ADMIN) {
      throw new ForbiddenError("Only the author or an admin can update this note");
    }

    const updatedNote = await crmRepository.updateNote(businessId, noteId, body);
    return {
      id: updatedNote.id,
      body: updatedNote.body,
      createdAt: updatedNote.createdAt.toISOString(),
      updatedAt: updatedNote.updatedAt.toISOString(),
      author: updatedNote.author
        ? { id: updatedNote.author.id, name: updatedNote.author.name }
        : null,
    };
  },

  async deleteNote(
    businessId: number,
    publicId: string,
    noteId: number,
    userId: number,
    userRole: Role,
  ): Promise<void> {
    const profile = await crmRepository.findProfileByPublicId(businessId, publicId);
    if (!profile) throw new NotFoundError("Customer not found");

    const note = await crmRepository.findNoteForBusiness(businessId, noteId);
    if (!note) throw new NotFoundError("Note not found");
    // Allow delete if the user is the author OR an admin
    if (note.authorId !== userId && userRole !== Role.ADMIN) {
      throw new ForbiddenError("Only the author or an admin can delete this note");
    }

    await crmRepository.deleteNote(businessId, noteId);
  },

  // -------- Tags ------------------------------------------------------------

  async listTags(businessId: number): Promise<TagApi[]> {
    const tags = await crmRepository.listTags(businessId);
    return tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt.toISOString(),
    }));
  },

  async createTag(
    businessId: number,
    name: string,
    color: string | null,
  ): Promise<TagApi> {
    const tag = await crmRepository.createTag(businessId, name, color);
    return {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt.toISOString(),
    };
  },

  async deleteTag(businessId: number, tagId: number): Promise<void> {
    await crmRepository.deleteTag(businessId, tagId);
  },

  async attachTag(
    businessId: number,
    publicId: string,
    tagId: number,
  ): Promise<{ attached: boolean }> {
    const profile = await crmRepository.findProfileByPublicId(businessId, publicId);
    if (!profile) throw new NotFoundError("Customer not found");

    return await crmRepository.attachTag(businessId, profile.id, tagId);
  },

  async detachTag(
    businessId: number,
    publicId: string,
    tagId: number,
  ): Promise<void> {
    const profile = await crmRepository.findProfileByPublicId(businessId, publicId);
    if (!profile) throw new NotFoundError("Customer not found");

    await crmRepository.detachTag(businessId, profile.id, tagId);
  },
};

// Funções puras expostas para o controller validar query sem duplicar o nome
// do enum — manter uma única fonte de verdade evita o controller aceitar o que
// o serviço recusa (ou vice-versa).
export { parseProfileSort, parseProfileStatus };