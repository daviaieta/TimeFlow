import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOrigins } from "./origins";

test("variável ausente cai no front local", () => {
  assert.deepEqual(parseOrigins(undefined), ["http://localhost:3000"]);
});

test("string vazia cai no front local", () => {
  assert.deepEqual(parseOrigins(""), ["http://localhost:3000"]);
});

test("origem única vira lista de um", () => {
  assert.deepEqual(parseOrigins("https://app.exemplo.com"), [
    "https://app.exemplo.com",
  ]);
});

test("lista separada por vírgula ignora espaços em volta", () => {
  assert.deepEqual(
    parseOrigins("https://app.exemplo.com, https://exemplo.vercel.app"),
    ["https://app.exemplo.com", "https://exemplo.vercel.app"],
  );
});

test("vírgula sobrando não vira origem vazia", () => {
  assert.deepEqual(parseOrigins("https://app.exemplo.com,,"), [
    "https://app.exemplo.com",
  ]);
});
