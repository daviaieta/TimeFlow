import { Role } from "@prisma/client";
import { FastifyReply, FastifyRequest } from "fastify";
import { ForbiddenError } from "../lib/errors";

export function authorize(...allowedRoles: Role[]) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError("You do not have permission to perform this action");
    }
  };
}
