import { FastifyReply, FastifyRequest } from "fastify";
import { businessService } from "../services/businessService";

export interface CreateBusinessBody {
  name: string;
  slug: string;
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
