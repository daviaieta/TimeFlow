import "dotenv/config";
import { fastify, FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "./lib/errors";

const app = fastify();

app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  if (error.validation) {
    return reply.status(400).send({ message: error.message });
  }

  request.log.error(error);
  return reply.status(500).send({ message: "Internal server error" });
});

app.get("/", async () => {
  return { message: "Welcome to BOOKING SAAS" };
});

// REGISTER ROUTES HERE

app.listen({
  port: 3333,
});

console.log("Server running: http://localhost:3333");
