import { FastifyReply, FastifyRequest } from "fastify";
import { BadRequestError } from "../lib/errors";
import { requireBusinessId } from "../lib/requireBusinessId";
import {
  CrmMetricsApi,
  CrmSettingsApi,
  ListProfilesInput,
  ProfileApi,
  BookingApi,
  crmService,
  parseProfileSort,
  parseProfileStatus,
} from "../services/crmService";
import {
  CreateCustomerInput,
  InvalidCustomerError,
  UpdateCrmSettingsInput,
  UpdateCustomerInput,
  validateCreateCustomer,
  validateCrmSettingsPatch,
  validateUpdateCustomer,
} from "../services/customerRules";

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

// A regra pura levanta InvalidCustomerError; a tradução para o status HTTP é
// daqui — customerRules não importa a camada de erro para continuar testável
// sem Fastify. Mesmo desenho do createLoyaltyAdjust com InvalidTagError.
function asBadRequest<T>(validate: () => T): T {
  try {
    return validate();
  } catch (err) {
    if (err instanceof InvalidCustomerError) throw new BadRequestError(err.message);
    throw err;
  }
}

export type CreateCustomerBody = CreateCustomerInput;
export type UpdateCustomerBody = UpdateCustomerInput;
export type UpdateCrmSettingsBody = UpdateCrmSettingsInput;

export async function createCustomer(
  request: FastifyRequest<{ Body: CreateCustomerBody }>,
  reply: FastifyReply,
): Promise<void> {
  const input = asBadRequest(() => validateCreateCustomer(request.body));

  const { profile, created } = await crmService.createProfile(
    requireBusinessId(request),
    input,
  );

  // 201 quando o prontuário nasceu agora; 200 quando o contato já era cliente
  // daqui e a criação reencontrou o cadastro. Cadastrar duas vezes o mesmo
  // telefone é o erro mais comum do balcão, e responder com o prontuário certo
  // é mais útil que um 409 que obriga o painel a buscar de novo.
  reply.status(created ? 201 : 200).send({ profile, created });
}

export async function updateCustomer(
  request: FastifyRequest<{ Params: CustomerParams; Body: UpdateCustomerBody }>,
  reply: FastifyReply,
): Promise<void> {
  const patch = asBadRequest(() => validateUpdateCustomer(request.body));

  const profile: ProfileApi = await crmService.updateProfile(
    requireBusinessId(request),
    request.params.publicId,
    patch,
  );
  reply.send({ profile });
}

export async function getCrmSettings(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const settings: CrmSettingsApi = await crmService.getSettings(requireBusinessId(request));
  reply.send({ settings });
}

export async function updateCrmSettings(
  request: FastifyRequest<{ Body: UpdateCrmSettingsBody }>,
  reply: FastifyReply,
): Promise<void> {
  const patch = asBadRequest(() => validateCrmSettingsPatch(request.body));

  const settings: CrmSettingsApi = await crmService.updateSettings(
    requireBusinessId(request),
    patch,
  );
  reply.send({ settings });
}

export async function getCrmMetrics(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const metrics: CrmMetricsApi = await crmService.getMetrics(requireBusinessId(request));
  reply.send({ metrics });
}
