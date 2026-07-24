import assert from "node:assert/strict";
import { test } from "node:test";
import { businessInitials, formatBusinessName } from "./businessName.ts";

test("nome em formato slug vira title case", () => {
  assert.equal(formatBusinessName("old-brothers"), "Old Brothers");
  assert.equal(formatBusinessName("studio_e2e"), "Studio E2e");
});

test("nome já escrito por humano passa intacto", () => {
  assert.equal(formatBusinessName("Barbearia Teste"), "Barbearia Teste");
  assert.equal(formatBusinessName("Salao Outro"), "Salao Outro");
});

test("marca minúscula sem hífen não é alterada", () => {
  assert.equal(formatBusinessName("adidas"), "adidas");
});

test("espaços em volta são removidos", () => {
  assert.equal(formatBusinessName("  old-brothers  "), "Old Brothers");
});

test("string vazia não quebra", () => {
  assert.equal(formatBusinessName(""), "");
  assert.equal(businessInitials(""), "");
});

test("iniciais usam as duas primeiras palavras", () => {
  assert.equal(businessInitials("Old Brothers"), "OB");
  assert.equal(businessInitials("old-brothers"), "OB");
  assert.equal(businessInitials("Studio"), "S");
});
