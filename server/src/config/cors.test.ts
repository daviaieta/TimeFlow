import assert from "node:assert/strict";
import { test } from "node:test";
import fastifyCors from "@fastify/cors";
import { fastify } from "fastify";
import { corsOptions } from "./cors";
import { env } from "./env";

// Regressão: o default do @fastify/cors ("GET,HEAD,POST") fazia o browser
// bloquear o DELETE de /employees/:id/services/:serviceId no preflight, mesmo
// com a rota respondendo 204 via curl.
async function preflightAllowedMethods(requestedMethod: string): Promise<string[]> {
  const app = fastify();
  await app.register(fastifyCors, corsOptions);
  app.delete("/employees/:id/services/:serviceId", async (_request, reply) =>
    reply.status(204).send(),
  );

  const response = await app.inject({
    method: "OPTIONS",
    url: "/employees/1/services/2",
    headers: {
      origin: env.webOrigin,
      "access-control-request-method": requestedMethod,
    },
  });

  await app.close();

  return String(response.headers["access-control-allow-methods"] ?? "")
    .split(",")
    .map((method) => method.trim());
}

for (const method of ["GET", "POST", "PUT", "DELETE"]) {
  test(`preflight libera ${method} para o front`, async () => {
    const allowed = await preflightAllowedMethods(method);

    assert.ok(
      allowed.includes(method),
      `${method} ausente em access-control-allow-methods: ${allowed.join(", ")}`,
    );
  });
}
