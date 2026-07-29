import assert from "node:assert/strict";
import { test } from "node:test";
import { extractResponseUrl } from "./imageResponseField.ts";

test("lê logoUrl da resposta do negócio", () => {
  const url = extractResponseUrl(
    { business: { logoUrl: "https://cdn/logo.webp", bannerUrl: null } },
    { entity: "business", field: "logoUrl" },
  );

  assert.equal(url, "https://cdn/logo.webp");
});

test("lê bannerUrl da resposta do negócio, ignorando logoUrl", () => {
  const url = extractResponseUrl(
    { business: { logoUrl: "https://cdn/logo.webp", bannerUrl: "https://cdn/banner.webp" } },
    { entity: "business", field: "bannerUrl" },
  );

  assert.equal(url, "https://cdn/banner.webp");
});

test("lê avatarUrl da resposta do colaborador", () => {
  const url = extractResponseUrl(
    { employee: { avatarUrl: "https://cdn/avatar.webp" } },
    { entity: "employee", field: "avatarUrl" },
  );

  assert.equal(url, "https://cdn/avatar.webp");
});

test("campo nulo na resposta (remoção) devolve null", () => {
  const url = extractResponseUrl(
    { business: { logoUrl: null, bannerUrl: null } },
    { entity: "business", field: "logoUrl" },
  );

  assert.equal(url, null);
});

test("entidade declarada ausente na resposta estoura erro visível", () => {
  assert.throws(
    () => extractResponseUrl({ employee: { avatarUrl: "x" } }, { entity: "business", field: "logoUrl" }),
    /resposta do servidor veio incompleta/,
  );
});

test("campo declarado ausente dentro da entidade estoura erro visível", () => {
  assert.throws(
    () => extractResponseUrl({ business: { logoUrl: "x" } }, { entity: "business", field: "bannerUrl" }),
    /resposta do servidor veio incompleta/,
  );
});

test("resposta vazia estoura erro visível em vez de silêncio", () => {
  assert.throws(
    () => extractResponseUrl({}, { entity: "business", field: "logoUrl" }),
    /resposta do servidor veio incompleta/,
  );
});
