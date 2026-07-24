import assert from "node:assert/strict";
import { test } from "node:test";
import { fastify, FastifyInstance } from "fastify";
import { errorHandler } from "./errorHandler";
import { ConflictError } from "./errors";

function buildApp(): FastifyInstance {
  const app = fastify();
  app.setErrorHandler(errorHandler);

  app.delete("/employees/:id/services/:serviceId", async (_request, reply) =>
    reply.status(204).send(),
  );
  app.get("/conflito", async () => {
    throw new ConflictError("This employee has booked time slots and cannot be removed");
  });
  app.get("/explode", async () => {
    throw new Error("falha inesperada");
  });

  return app;
}

// Regressão: o front manda Content-Type: application/json em toda requisição.
// Num DELETE sem body o Fastify lança FST_ERR_CTP_EMPTY_JSON_BODY (400), que
// virava "Internal server error" e escondia a causa real.
test("erro de body vazio do Fastify responde 400, não 500", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "DELETE",
    url: "/employees/13/services/4",
    headers: { "content-type": "application/json" },
  });

  await app.close();

  assert.equal(response.statusCode, 400);
  assert.notEqual(response.json().message, "Internal server error");
});

test("erro de domínio mantém status e mensagem", async () => {
  const app = buildApp();

  const response = await app.inject({ method: "GET", url: "/conflito" });

  await app.close();

  assert.equal(response.statusCode, 409);
  assert.equal(
    response.json().message,
    "This employee has booked time slots and cannot be removed",
  );
});

test("erro inesperado continua 500 sem vazar detalhe", async () => {
  const app = buildApp();
  app.log.level = "silent";

  const response = await app.inject({ method: "GET", url: "/explode" });

  await app.close();

  assert.equal(response.statusCode, 500);
  assert.equal(response.json().message, "Internal server error");
});
