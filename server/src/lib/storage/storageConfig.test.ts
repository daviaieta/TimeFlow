import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveStorageConfig } from "./storageConfig";

const FALLBACK = { rootDir: "/tmp/uploads", baseUrl: "http://localhost:3333" };

const FULL_R2 = {
  R2_ACCOUNT_ID: "acc",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "timeflow",
  R2_PUBLIC_URL: "https://cdn.exemplo.com/",
};

test("sem nenhuma variável do R2, cai no disco", () => {
  assert.deepEqual(resolveStorageConfig({}, FALLBACK), {
    mode: "disk",
    rootDir: "/tmp/uploads",
    baseUrl: "http://localhost:3333",
  });
});

test("com todas as variáveis, usa R2 e tira a barra final da URL pública", () => {
  assert.deepEqual(resolveStorageConfig(FULL_R2, FALLBACK), {
    mode: "r2",
    accountId: "acc",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucket: "timeflow",
    publicUrl: "https://cdn.exemplo.com",
  });
});

// Falha fechado: configuração pela metade em produção gravaria no disco
// efêmero do container e as fotos sumiriam no deploy seguinte, sem erro.
test("com configuração pela metade, explode dizendo o que falta", () => {
  const partial = { R2_ACCOUNT_ID: "acc", R2_BUCKET: "timeflow" };

  assert.throws(
    () => resolveStorageConfig(partial, FALLBACK),
    /R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*R2_PUBLIC_URL/s,
  );
});

test("variável presente mas vazia conta como ausente", () => {
  assert.equal(resolveStorageConfig({ R2_BUCKET: "   " }, FALLBACK).mode, "disk");
});
