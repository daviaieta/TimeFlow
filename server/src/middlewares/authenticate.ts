import { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../lib/errors";

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError("Invalid or missing token");
  }
}
