import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  confirmCheckout,
  createCheckoutSession,
  receiveStripeWebhook,
  CheckoutSessionBody,
  CheckoutSessionParams,
  ConfirmCheckoutBody,
} from "../controllers/billingController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const businessParamsSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id: { type: "integer" },
  },
};

const createCheckoutSessionSchema = {
  params: businessParamsSchema,
  body: {
    type: "object",
    required: ["planName"],
    additionalProperties: false,
    properties: {
      planName: { type: "string", enum: ["ESSENCIAL", "PROFISSIONAL", "EQUIPE"] },
    },
  },
};

const confirmCheckoutSchema = {
  params: businessParamsSchema,
  body: {
    type: "object",
    required: ["sessionId"],
    additionalProperties: false,
    properties: {
      sessionId: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
};

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: CheckoutSessionParams; Body: CheckoutSessionBody }>(
    "/businesses/:id/checkout-session",
    {
      schema: createCheckoutSessionSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    createCheckoutSession,
  );

  app.post<{ Params: CheckoutSessionParams; Body: ConfirmCheckoutBody }>(
    "/businesses/:id/checkout-session/confirm",
    {
      schema: confirmCheckoutSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    confirmCheckout,
  );
}

// Plugin separado por causa do corpo cru: constructEvent precisa dos bytes
// EXATOS que o Stripe assinou, e o parser JSON padrão do Fastify entregaria um
// objeto reserializado — a assinatura nunca bateria. Como content type parser
// é encapsulado por plugin, isolar aqui não afeta nenhuma outra rota.
export async function stripeWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.post("/webhooks/stripe", receiveStripeWebhook);
}
