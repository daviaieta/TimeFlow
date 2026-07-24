import "dotenv/config";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { fastify } from "fastify";
import { corsOptions } from "./config/cors";
import { env } from "./config/env";
import { errorHandler } from "./lib/errorHandler";
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

app.setErrorHandler(errorHandler);

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
