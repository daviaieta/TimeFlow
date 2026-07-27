import { PlanName } from "@prisma/client";
import { FastifyReply, FastifyRequest } from "fastify";
import { billingService } from "../services/billingService";

export interface SubscribeParams {
  id: number;
}

export interface SubscribeBody {
  planName: PlanName;
  cpfCnpj: string;
}

export async function subscribe(
  request: FastifyRequest<{ Params: SubscribeParams; Body: SubscribeBody }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await billingService.subscribe(
    request.params.id,
    request.user.businessId,
    request.user.sub,
    request.body,
  );

  reply.send(result);
}

export interface WebhookBody {
  event: string;
  payment?: { id: string; subscription?: string; status: string };
}

export async function receiveWebhook(
  request: FastifyRequest<{ Body: WebhookBody }>,
  reply: FastifyReply,
): Promise<void> {
  await billingService.handleWebhook(request.body);
  reply.status(200).send();
}
