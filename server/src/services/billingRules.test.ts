import assert from "node:assert/strict";
import { test } from "node:test";
import { planDescription, planPrice, statusFromWebhookEvent } from "./billingRules";

test("planPrice devolve os 3 valores certos", () => {
  assert.equal(planPrice("ESSENCIAL"), 49.9);
  assert.equal(planPrice("PROFISSIONAL"), 89.9);
  assert.equal(planPrice("EQUIPE"), 179.9);
});

test("planDescription nomeia o plano em português", () => {
  assert.equal(planDescription("ESSENCIAL"), "Time Flow - Plano Essencial");
  assert.equal(planDescription("PROFISSIONAL"), "Time Flow - Plano Profissional");
  assert.equal(planDescription("EQUIPE"), "Time Flow - Plano Equipe");
});

test("statusFromWebhookEvent mapeia confirmação de pagamento para ACTIVE", () => {
  assert.equal(statusFromWebhookEvent("PAYMENT_CONFIRMED"), "ACTIVE");
  assert.equal(statusFromWebhookEvent("PAYMENT_RECEIVED"), "ACTIVE");
});

test("statusFromWebhookEvent mapeia atraso para PAST_DUE", () => {
  assert.equal(statusFromWebhookEvent("PAYMENT_OVERDUE"), "PAST_DUE");
});

test("statusFromWebhookEvent ignora eventos não mapeados", () => {
  assert.equal(statusFromWebhookEvent("PAYMENT_CREATED"), null);
  assert.equal(statusFromWebhookEvent("PAYMENT_DELETED"), null);
  assert.equal(statusFromWebhookEvent("algo-desconhecido"), null);
});
