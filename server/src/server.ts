import "dotenv/config";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { fastify, FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { env } from "./config/env";
import { AppError } from "./lib/errors";
import { authRoutes } from "./routes/authRoutes";
import { businessRoutes } from "./routes/businessRoutes";
import "./interfaces/auth";

const app = fastify({
  ajv: {
    customOptions: {
      removeAdditional: true,
      coerceTypes: true,
      allErrors: true,
    },
  },
});

app.register(fastifyCors, {
  origin: env.webOrigin,
});

app.register(fastifyJwt, {
  secret: env.jwtSecret,
});

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
  return { message: "Welcome to TIME FLOW" };
});

app.register(authRoutes);
app.register(businessRoutes);

app.listen({
  port: env.port,
});

console.log(`Server running: http://localhost:${env.port}`);
