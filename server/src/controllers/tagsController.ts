import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import { crmService } from "../services/crmService";
import { BadRequestError } from "../lib/errors";

// businessId nunca vem da URL — vem do token, via requireBusinessId.
export interface TagParams {
  tagId: string;
}

export interface CustomerTagParams {
  publicId: string;
  tagId: string;
}

export async function listTags(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const businessId = requireBusinessId(request);
  const tags = await crmService.listTags(businessId);
  reply.send({ tags });
}

export async function createTag(
  request: FastifyRequest<{ Body: { name: string; color: string | null } }>,
  reply: FastifyReply
): Promise<void> {
  const businessId = requireBusinessId(request);
  const { name, color } = request.body;
  if (!name || name.trim() === "") {
    throw new BadRequestError("Tag name cannot be empty");
  }
  const tag = await crmService.createTag(businessId, name, color);
  reply.status(201).send({ tag });
}

export async function deleteTag(
  request: FastifyRequest<{ Params: TagParams }>,
  reply: FastifyReply
): Promise<void> {
  const businessId = requireBusinessId(request);
  const { tagId } = request.params;
  const id = parseInt(tagId, 10);
  if (isNaN(id)) {
    throw new BadRequestError("Invalid tag ID");
  }
  await crmService.deleteTag(businessId, id);
  reply.send({ success: true });
}

export async function attachTag(
  request: FastifyRequest<{ Params: CustomerTagParams }>,
  reply: FastifyReply
): Promise<void> {
  const businessId = requireBusinessId(request);
  const { publicId, tagId } = request.params;
  const id = parseInt(tagId, 10);
  if (isNaN(id)) {
    throw new BadRequestError("Invalid tag ID");
  }
  const result = await crmService.attachTag(businessId, publicId, id);
  reply.send(result);
}

export async function detachTag(
  request: FastifyRequest<{ Params: CustomerTagParams }>,
  reply: FastifyReply
): Promise<void> {
  const businessId = requireBusinessId(request);
  const { publicId, tagId } = request.params;
  const id = parseInt(tagId, 10);
  if (isNaN(id)) {
    throw new BadRequestError("Invalid tag ID");
  }
  await crmService.detachTag(businessId, publicId, id);
  reply.send({ success: true });
}