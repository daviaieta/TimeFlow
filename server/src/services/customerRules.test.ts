import assert from "node:assert/strict";
import { LoyaltyEntryKind } from "@prisma/client";
import { test } from "node:test";
import {
  ADJUST_REASON_MAX,
  ADJUST_REASON_MIN,
  InvalidCursorError,
  InvalidTagError,
  PROFILE_PAGE_SIZE,
  PROFILE_PAGE_SIZE_MAX,
  clampPageSize,
  decodeProfileCursor,
  encodeProfileCursor,
  decodeBookingCursor,
  encodeBookingCursor,
  isManualLoyaltyKind,
  parseProfileSort,
  parseProfileStatus,
  validateLoyaltyAdjust,
  validateTagInput,
} from "./customerRules";

test("encodeProfileCursor / decodeProfileCursor roundtrip", () => {
  const cursor = { lastBookedAt: new Date("2026-07-30T13:00:00.000Z"), id: 42, displayName: "Davi" };
  const encoded = encodeProfileCursor(cursor);
  assert.ok(typeof encoded === "string" && encoded.length > 0);

  const decoded = decodeProfileCursor(encoded);
  assert.ok(decoded);
  assert.equal(decoded.id, 42);
  assert.equal(decoded.lastBookedAt.toISOString(), "2026-07-30T13:00:00.000Z");
  assert.equal(decoded.displayName, "Davi");
});

test("encodeProfileCursor preserva nome com caracteres especiais", () => {
  // O nome vai do dashboard — uma atendente digitar "Davi | Silva" tem que
  // sobreviver ao roundtrip sem corromper a decodificação.
  const cursor = { lastBookedAt: new Date("2026-07-30T13:00:00.000Z"), id: 1, displayName: "Davi | Silva" };
  const decoded = decodeProfileCursor(encodeProfileCursor(cursor));
  assert.ok(decoded);
  assert.equal(decoded.displayName, "Davi | Silva");
});

test("decodeProfileCursor devolve null para entrada vazia", () => {
  assert.equal(decodeProfileCursor(null), null);
  assert.equal(decodeProfileCursor(undefined), null);
  assert.equal(decodeProfileCursor(""), null);
});

test("decodeProfileCursor rejeita base64-url de formato errado", () => {
  assert.throws(() => decodeProfileCursor("not-a-cursor"), InvalidCursorError);
  // Versão desconhecida
  assert.throws(() => decodeProfileCursor(Buffer.from("p9:1|2|x", "utf8").toString("base64url")), InvalidCursorError);
  // Formato certo mas valores inválidos
  assert.throws(() => decodeProfileCursor(Buffer.from("p2:abc|1|x", "utf8").toString("base64url")), InvalidCursorError);
  assert.throws(() => decodeProfileCursor(Buffer.from("p2:1|-1|x", "utf8").toString("base64url")), InvalidCursorError);
});

test("clampPageSize: default, teto, e lixo", () => {
  assert.equal(clampPageSize(undefined), PROFILE_PAGE_SIZE);
  assert.equal(clampPageSize(0), PROFILE_PAGE_SIZE);
  assert.equal(clampPageSize(-5), PROFILE_PAGE_SIZE);
  assert.equal(clampPageSize(10), 10);
  assert.equal(clampPageSize(PROFILE_PAGE_SIZE_MAX + 1), PROFILE_PAGE_SIZE_MAX);
  assert.equal(clampPageSize(PROFILE_PAGE_SIZE_MAX), PROFILE_PAGE_SIZE_MAX);
});

test("parseProfileSort: recente é o default", () => {
  assert.equal(parseProfileSort(undefined), "recent");
  assert.equal(parseProfileSort("recent"), "recent");
  assert.equal(parseProfileSort("name"), "name");
  // Qualquer valor fora do enum cai no default em vez de explodir — o painel
  // nunca envia outra coisa, mas o contrato de API é tolerante aqui.
  assert.equal(parseProfileSort("xxx"), "recent");
});

test("parseProfileStatus: aceita enum válido e devolve null para o resto", () => {
  assert.equal(parseProfileStatus(undefined), null);
  assert.equal(parseProfileStatus("ACTIVE"), "ACTIVE");
  assert.equal(parseProfileStatus("BLOCKED"), "BLOCKED");
  assert.equal(parseProfileStatus("archived"), null);
});

test("validateTagInput: regras de nome e cor", () => {
  assert.deepEqual(validateTagInput("VIP", null), { name: "VIP", color: null });
  assert.deepEqual(validateTagInput("  VIP  ", "#1A2B3C"), { name: "VIP", color: "#1A2B3C" });
  assert.throws(() => validateTagInput("", null), InvalidTagError);
  assert.throws(() => validateTagInput("   ", null), InvalidTagError);
  assert.throws(() => validateTagInput("x".repeat(33), null), InvalidTagError);
  assert.throws(() => validateTagInput("VIP", "laranja"), InvalidTagError);
  assert.throws(() => validateTagInput("VIP", "#fff"), InvalidTagError); // precisa ser 6 dígitos
  assert.throws(() => validateTagInput("VIP", "1A2B3C"), InvalidTagError);
});

test("validateLoyaltyAdjust: pontos não-zero e motivo obrigatório", () => {
  assert.deepEqual(validateLoyaltyAdjust({ points: 5, reason: "cortesia" }), {
    points: 5,
    reason: "cortesia",
    idempotencyKey: null,
  });
  // Negativo é OK: correção pra subtrair pontos é o uso esperado.
  assert.equal(validateLoyaltyAdjust({ points: -10, reason: "erro de lançamento" }).points, -10);

  assert.throws(() => validateLoyaltyAdjust({ points: 0, reason: "x" }), InvalidTagError);
  assert.throws(() => validateLoyaltyAdjust({ points: 1.5, reason: "x" }), InvalidTagError);
  assert.throws(
    () => validateLoyaltyAdjust({ points: 1, reason: "a".repeat(ADJUST_REASON_MIN - 1) }),
    InvalidTagError,
  );
  assert.throws(
    () => validateLoyaltyAdjust({ points: 1, reason: "a".repeat(ADJUST_REASON_MAX + 1) }),
    InvalidTagError,
  );
  assert.throws(
    () => validateLoyaltyAdjust({ points: 1, reason: "ok", idempotencyKey: "x".repeat(201) }),
    InvalidTagError,
  );
});

test("isManualLoyaltyKind: só ADJUST é manual", () => {
  assert.ok(isManualLoyaltyKind(LoyaltyEntryKind.ADJUST));
  assert.ok(!isManualLoyaltyKind(LoyaltyEntryKind.EARN));
  assert.ok(!isManualLoyaltyKind(LoyaltyEntryKind.REDEEM));
  assert.ok(!isManualLoyaltyKind(LoyaltyEntryKind.EXPIRE));
});

test("encodeBookingCursor / decodeBookingCursor roundtrip", () => {
  const cursor = { createdAt: new Date("2026-07-30T13:00:00.000Z"), id: 7 };
  const decoded = decodeBookingCursor(encodeBookingCursor(cursor));
  assert.ok(decoded);
  assert.equal(decoded.id, 7);
  assert.equal(decoded.createdAt.toISOString(), "2026-07-30T13:00:00.000Z");
});

test("decodeBookingCursor devolve null para entrada vazia", () => {
  assert.equal(decodeBookingCursor(null), null);
  assert.equal(decodeBookingCursor(undefined), null);
  assert.equal(decodeBookingCursor(""), null);
});

test("decodeBookingCursor rejeita formato errado", () => {
  assert.throws(() => decodeBookingCursor("lixo"), InvalidCursorError);
  // prefix de versão errada
  assert.throws(
    () => decodeBookingCursor(Buffer.from("b9:1|2", "utf8").toString("base64url")),
    InvalidCursorError,
  );
  // valores não numéricos
  assert.throws(
    () => decodeBookingCursor(Buffer.from("b1:abc|2", "utf8").toString("base64url")),
    InvalidCursorError,
  );
  // id negativo
  assert.throws(
    () => decodeBookingCursor(Buffer.from("b1:1|-1", "utf8").toString("base64url")),
    InvalidCursorError,
  );
});
