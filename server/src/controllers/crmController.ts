import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import {
  ListProfilesInput,
  ProfileApi,
  BookingApi,
  crmService,
  parseProfileSort,
  parseProfileStatus,
} from "../services/crmService";

// Handlers do CRM de negócio (fase 4). Thin de propósito: validação de query
// tolerante (sort/status aceitam qualquer coisa e caem no default) fica no
// rules; validação de formato fica no schema da rota; a trava de tenant
// (businessId) vem do token via requireBusinessId — nunca da URL. publicId é
// resolvido DENTRO do escopo no serviço; um que pertence a outro negócio é 404,
// não 403, porque 403 confirmaria que a linha existe e só não é sua.

// coerceTypes do Fastify converte os integers da query para number antes do
// handler; string para os demais. O schema da rota é quem berra os valores
// inválidos, então aqui só normalizo opcionais.
export interface ListCustomersQuery {
  search?: string;
  status?: string;
  tagId?: number;
  sort?: string;
  cursor?: string;
  limit?: number;
}

export interface CustomerParams {
  publicId: string;
}

export interface CustomerBookingsQuery {
  cursor?: string;
  limit?: number;
}

export async function listCustomers(
  request: FastifyRequest<{ Querystring: ListCustomersQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const search = request.query.search?.trim() ?? null;

  const input: ListProfilesInput = {
    businessId: requireBusinessId(request),
    search: search && search.length > 0 ? search : null,
    status: parseProfileStatus(request.query.status),
    tagId: request.query.tagId ?? null,
    sort: parseProfileSort(request.query.sort),
    cursorRaw: request.query.cursor ?? null,
    limit: request.query.limit ?? undefined,
  };

  const result = await crmService.listProfiles(input);
  reply.send(result);
}

export async function getCustomer(
  request: FastifyRequest<{ Params: CustomerParams }>,
  reply: FastifyReply,
): Promise<void> {
  const profile: ProfileApi = await crmService.getProfile(
    requireBusinessId(request),
    request.params.publicId,
  );
  reply.send({ profile });
}

export async function getCustomerBookings(
  request: FastifyRequest<{ Params: CustomerParams; Querystring: CustomerBookingsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result: { bookings: BookingApi[]; nextCursor: string | null } =
    await crmService.listBookings(
      requireBusinessId(request),
      request.params.publicId,
      request.query.cursor ?? null,
      request.query.limit,
    );
  reply.send(result);
}
