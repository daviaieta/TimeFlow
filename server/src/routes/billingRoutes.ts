import { Role } from "@prisma/client";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  receiveWebhook,
  subscribe,
  SubscribeBody,
  SubscribeParams,
  WebhookBody,
} from "../controllers/billingController";
import { env } from "../config/env";
import { UnauthorizedError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const subscribeSchema = {
  params: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["planName", "cpfCnpj"],
    additionalProperties: false,
    properties: {
      planName: { type: "string", enum: ["ESSENCIAL", "PROFISSIONAL", "EQUIPE"] },
      // CPF (11 dígitos) ou CNPJ (14), sem pontuação — o Asaas valida o
      // dígito verificador do lado dele.
      cpfCnpj: { type: "string", pattern: "^\\d{11}(\\d{3})?$" },
    },
  },
};

// O Asaas não conhece nosso JWT — a prova de que a chamada é dele mesmo é um
// token fixo configurado no painel do Asaas e conferido aqui.
async function verifyAsaasWebhook(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (request.headers["asaas-access-token"] !== env.asaasWebhookToken) {
    throw new UnauthorizedError("Invalid webhook token");
  }
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: SubscribeParams; Body: SubscribeBody }>(
    "/businesses/:id/subscription",
    {
      schema: subscribeSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    subscribe,
  );

  app.post<{ Body: WebhookBody }>(
    "/webhooks/asaas",
    { preHandler: [verifyAsaasWebhook] },
    receiveWebhook,
  );
}
