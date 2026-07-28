import assert from "node:assert/strict";
import { test } from "node:test";
import {
  planDescription,
  planPrice,
  planPriceInCents,
  statusFromStripeEvent,
} from "./billingRules";

test("planPrice devolve os 3 valores certos", () => {
  assert.equal(planPrice("ESSENCIAL"), 49.9);
  assert.equal(planPrice("PROFISSIONAL"), 89.9);
  assert.equal(planPrice("EQUIPE"), 179.9);
});

test("planPriceInCents devolve inteiros exatos, sem resíduo de float", () => {
  assert.equal(planPriceInCents("ESSENCIAL"), 4990);
  assert.equal(planPriceInCents("PROFISSIONAL"), 8990);
  assert.equal(planPriceInCents("EQUIPE"), 17990);
});

test("planDescription nomeia o plano em português", () => {
  assert.equal(planDescription("ESSENCIAL"), "Time Flow - Plano Essencial");
  assert.equal(planDescription("PROFISSIONAL"), "Time Flow - Plano Profissional");
  assert.equal(planDescription("EQUIPE"), "Time Flow - Plano Equipe");
});

test("statusFromStripeEvent ativa no checkout concluído e na fatura paga", () => {
  assert.equal(statusFromStripeEvent("checkout.session.completed"), "ACTIVE");
  assert.equal(statusFromStripeEvent("invoice.paid"), "ACTIVE");
});

test("statusFromStripeEvent marca atraso quando a fatura falha", () => {
  assert.equal(statusFromStripeEvent("invoice.payment_failed"), "PAST_DUE");
});

test("statusFromStripeEvent marca cancelamento quando a assinatura é removida", () => {
  assert.equal(statusFromStripeEvent("customer.subscription.deleted"), "CANCELED");
});

test("statusFromStripeEvent ignora eventos não mapeados", () => {
  assert.equal(statusFromStripeEvent("checkout.session.expired"), null);
  assert.equal(statusFromStripeEvent("payment_intent.created"), null);
  assert.equal(statusFromStripeEvent("algo-desconhecido"), null);
});
