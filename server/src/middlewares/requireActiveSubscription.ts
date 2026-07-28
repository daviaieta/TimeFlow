import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";
import { PaymentRequiredError } from "../lib/errors";
import { businessRepository } from "../repositories/businessRepository";

// Lê do banco a cada request, de propósito: subscriptionStatus muda por
// webhook, fora de qualquer login — colocar no JWT deixaria stale até o
// usuário logar de novo.
export async function requireActiveSubscription(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // Cobrança desligada: ninguém é barrado, nem quem está PENDING. O middleware
  // continua registrado nas rotas de propósito — religar é trocar a variável
  // no provedor, sem mexer em código.
  if (!env.billingEnabled) {
    return;
  }

  const { businessId } = request.user;
  if (businessId === null) {
    // SUPERADMIN não tem business — nunca é bloqueado por assinatura.
    return;
  }

  const business = await businessRepository.findById(businessId);
  if (!business || business.subscriptionStatus !== "ACTIVE") {
    throw new PaymentRequiredError();
  }
}
