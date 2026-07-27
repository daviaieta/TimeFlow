import { PlanName } from "@prisma/client";
import type Stripe from "stripe";
import { FastifyReply, FastifyRequest } from "fastify";
import { BadRequestError } from "../lib/errors";
import { stripeClient } from "../lib/stripeClient";
import { billingService } from "../services/billingService";

export interface CheckoutSessionParams {
  id: number;
}

export interface CheckoutSessionBody {
  planName: PlanName;
}

export async function createCheckoutSession(
  request: FastifyRequest<{ Params: CheckoutSessionParams; Body: CheckoutSessionBody }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await billingService.createCheckoutSession(
    request.params.id,
    request.user.businessId,
    request.user.sub,
    request.body,
  );

  reply.send(result);
}

export interface ConfirmCheckoutBody {
  sessionId: string;
}

export async function confirmCheckout(
  request: FastifyRequest<{ Params: CheckoutSessionParams; Body: ConfirmCheckoutBody }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await billingService.confirmCheckout(
    request.params.id,
    request.user.businessId,
    request.body.sessionId,
  );

  reply.send(result);
}

export async function receiveStripeWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const signature = request.headers["stripe-signature"];
  if (typeof signature !== "string") {
    throw new BadRequestError("Missing stripe-signature header");
  }

  let event: Stripe.Event;
  try {
    event = stripeClient.constructWebhookEvent(request.body as Buffer, signature);
  } catch {
    // 400 (e não 401) de propósito: é o que o Stripe espera, e ele reenvia.
    // Sem detalhe do motivo — não ajuda quem está forjando.
    throw new BadRequestError("Invalid webhook signature");
  }

  await billingService.handleWebhook(event);
  reply.status(200).send();
}
