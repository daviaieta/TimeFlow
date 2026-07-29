import { FastifyReply, FastifyRequest } from "fastify";
import { BadRequestError } from "../lib/errors";
import { businessService } from "../services/businessService";

export interface CreateBusinessBody {
  name: string;
  slug: string;
  address?: string | null;
  admin: {
    name: string;
    email: string;
  };
}

export async function createBusiness(
  request: FastifyRequest<{ Body: CreateBusinessBody }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await businessService.createBusiness(request.body);

  reply.status(201).send(result);
}

export async function listBusinesses(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  reply.send(await businessService.listBusinesses());
}

export interface ResendInviteParams {
  id: number;
}

export interface ResendInviteBody {
  userId: number;
}

export async function resendInvite(
  request: FastifyRequest<{ Params: ResendInviteParams; Body: ResendInviteBody }>,
  reply: FastifyReply,
): Promise<void> {
  await businessService.resendInvite(request.params.id, request.body.userId);

  reply.status(204).send();
}

export interface UpdateBusinessParams {
  id: number;
}

export interface UpdateBusinessBody {
  name: string;
  slug: string;
  address: string | null;
}

export async function updateBusiness(
  request: FastifyRequest<{ Params: UpdateBusinessParams; Body: UpdateBusinessBody }>,
  reply: FastifyReply,
): Promise<void> {
  const business = await businessService.updateBusiness(
    request.params.id,
    request.user.businessId,
    request.body,
  );

  reply.send({ business });
}

export interface BusinessImageParams {
  id: number;
}

async function readUploadedImage(request: FastifyRequest): Promise<Buffer> {
  const file = await request.file();
  if (!file) {
    throw new BadRequestError('Envie a imagem no campo "file".');
  }

  try {
    // O plugin corta o stream em MAX_IMAGE_BYTES e toBuffer lança antes de
    // devolver qualquer conteúdo — nunca chega a existir um Buffer maior
    // que o limite para checar depois.
    return await file.toBuffer();
  } catch (error) {
    if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
      throw new BadRequestError("A imagem precisa ter no máximo 2 MB.");
    }

    throw error;
  }
}

export async function uploadBusinessLogo(
  request: FastifyRequest<{ Params: BusinessImageParams }>,
  reply: FastifyReply,
): Promise<void> {
  const bytes = await readUploadedImage(request);
  const business = await businessService.updateBusinessImage(
    request.params.id,
    request.user.businessId,
    "logo",
    bytes,
  );

  reply.send({ business });
}

export async function deleteBusinessLogo(
  request: FastifyRequest<{ Params: BusinessImageParams }>,
  reply: FastifyReply,
): Promise<void> {
  const business = await businessService.removeBusinessImage(
    request.params.id,
    request.user.businessId,
    "logo",
  );

  reply.send({ business });
}

export async function uploadBusinessBanner(
  request: FastifyRequest<{ Params: BusinessImageParams }>,
  reply: FastifyReply,
): Promise<void> {
  const bytes = await readUploadedImage(request);
  const business = await businessService.updateBusinessImage(
    request.params.id,
    request.user.businessId,
    "banner",
    bytes,
  );

  reply.send({ business });
}

export async function deleteBusinessBanner(
  request: FastifyRequest<{ Params: BusinessImageParams }>,
  reply: FastifyReply,
): Promise<void> {
  const business = await businessService.removeBusinessImage(
    request.params.id,
    request.user.businessId,
    "banner",
  );

  reply.send({ business });
}
