import { FastifyRequest } from "fastify";
import { ForbiddenError } from "./errors";

export function requireBusinessId(request: FastifyRequest): number {
  const { businessId } = request.user;
  if (businessId === null) {
    throw new ForbiddenError("User is not linked to a business");
  }

  return businessId;
}
