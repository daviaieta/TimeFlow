import "dotenv/config";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { fastify, FastifyInstance } from "fastify";
import { corsOptions } from "./config/cors";
import { env } from "./config/env";
import { errorHandler } from "./lib/errorHandler";
import { availabilityRoutes } from "./routes/availabilityRoutes";
import { authRoutes } from "./routes/authRoutes";
import { billingRoutes } from "./routes/billingRoutes";
import { businessRoutes } from "./routes/businessRoutes";
import { dashboardRoutes } from "./routes/dashboardRoutes";
import { employeeRoutes } from "./routes/employeeRoutes";
import { healthRoutes } from "./routes/healthRoutes";
import { publicRoutes } from "./routes/publicRoutes";
import { serviceRoutes } from "./routes/serviceRoutes";
import "./interfaces/auth";

// Monta a aplicação sem subir o processo. Separar as duas coisas é o que
// permite testar rotas com app.inject() sem abrir porta.
export function buildApp(): FastifyInstance {
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
  app.register(fastifyJwt, { secret: env.jwtSecret });
  app.setErrorHandler(errorHandler);

  app.get("/", async () => {
    return { message: "Welcome to TIME FLOW" };
  });

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(businessRoutes);
  app.register(billingRoutes);
  app.register(dashboardRoutes);
  app.register(serviceRoutes);
  app.register(employeeRoutes);
  app.register(availabilityRoutes);
  app.register(publicRoutes);

  return app;
}
