import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import { crmService } from "../services/crmService";
import { validateLoyaltyAdjust, InvalidTagError } from "../services/customerRules";
import { BadRequestError } from "../lib/errors";

// Handlers de fidelidade (fase 4). Leitura: qualquer staff. Escrita (ADJUST):
// só ADMIN — a guarda do papel fica no middleware, aqui só validação de regra.

export interface LoyaltyCustomerParams {
  publicId: string;
}

export interface LoyaltyQuery {
  cursor?: string;
  limit?: number;
}

export interface CreateLoyaltyEntryBody {
  points: number;
  reason: string;
  idempotencyKey?: string;
}

export async function getLoyaltyEntries(
  request: FastifyRequest<{ Params: LoyaltyCustomerParams; Querystring: LoyaltyQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await crmService.listLoyaltyEntries(
    requireBusinessId(request),
    request.params.publicId,
    request.query.cursor ?? null,
    request.query.limit,
  );
  reply.send(result);
}

export async function createLoyaltyAdjust(
  request: FastifyRequest<{
    Params: LoyaltyCustomerParams;
    Body: CreateLoyaltyEntryBody;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const businessId = requireBusinessId(request);
  const { publicId } = request.params;

  let validated: { points: number; reason: string; idempotencyKey: string | null };
  try {
    validated = validateLoyaltyAdjust(request.body);
  } catch (err) {
    if (err instanceof InvalidTagError) {
      throw new BadRequestError(err.message);
    }
    throw err;
  }

  const userId = request.user.sub as number;
  const result = await crmService.applyLoyaltyAdjust(
    businessId,
    publicId,
    userId,
    validated.points,
    validated.reason,
    validated.idempotencyKey,
  );

  reply.status(result.alreadyApplied ? 200 : 201).send({
    id: result.id,
    alreadyApplied: result.alreadyApplied,
  });
}