import { Prisma } from "@prisma/client";
import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "./errors";

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  if (error.validation) {
    return reply.status(400).send({ message: error.message });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return reply.status(409).send({ message: "Resource already exists" });
    }

    if (error.code === "P2025") {
      return reply.status(404).send({ message: "Resource not found" });
    }

    if (error.code === "P2003") {
      return reply.status(409).send({ message: "Resource is referenced by other records" });
    }
  }

  // Erros do próprio Fastify (body vazio, content-type inválido, payload grande)
  // já trazem o status certo — sem isto viram 500 e escondem a causa real.
  if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  request.log.error(error);
  return reply.status(500).send({ message: "Internal server error" });
}
