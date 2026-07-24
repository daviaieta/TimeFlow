import "dotenv/config";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { Prisma } from "@prisma/client";
import { fastify, FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { corsOptions } from "./config/cors";
import { env } from "./config/env";
import { AppError } from "./lib/errors";
import { availabilityRoutes } from "./routes/availabilityRoutes";
import { authRoutes } from "./routes/authRoutes";
import { businessRoutes } from "./routes/businessRoutes";
import { employeeRoutes } from "./routes/employeeRoutes";
import { serviceRoutes } from "./routes/serviceRoutes";
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

app.register(fastifyCors, corsOptions);

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

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return reply.status(409).send({ message: "Resource already exists" });
    }

    if (error.code === "P2025") {
      return reply.status(404).send({ message: "Resource not found" });
    }

    if (error.code === "P2003") {
      return reply
        .status(409)
        .send({ message: "Resource is referenced by other records" });
    }
  }

  request.log.error(error);
  return reply.status(500).send({ message: "Internal server error" });
});

app.get("/", async () => {
  return { message: "Welcome to TIME FLOW" };
});

app.register(authRoutes);
app.register(businessRoutes);
app.register(serviceRoutes);
app.register(employeeRoutes);
app.register(availabilityRoutes);

app.listen({
  port: env.port,
});

console.log(`Server running: http://localhost:${env.port}`);
