import assert from "node:assert/strict";
import { test } from "node:test";
import type { BusinessRow } from "./platform.ts";
import {
  SLUG_PATTERN,
  businessStatus,
  formatTeam,
  slugify,
} from "./platform.ts";

function row(overrides: Partial<BusinessRow> = {}): BusinessRow {
  return {
    id: 1,
    name: "Barbearia do Zé",
    slug: "barbearia-do-ze",
    createdAt: "2026-07-20T14:03:11.000Z",
    employees: 3,
    admins: 1,
    pendingInvites: [],
    ...overrides,
  };
}

test("slugify remove acento e baixa a caixa", () => {
  assert.equal(slugify("Barbearia do Zé"), "barbearia-do-ze");
  assert.equal(slugify("Salão Beleza & Cia"), "salao-beleza-cia");
});

test("slugify colapsa separadores repetidos num hífen só", () => {
  assert.equal(slugify("Studio   ---   Nova"), "studio-nova");
});

test("slugify não deixa hífen sobrando nas pontas", () => {
  assert.equal(slugify("  Ateliê!  "), "atelie");
  assert.equal(slugify("---"), "");
});

test("slugify de string vazia devolve string vazia, não quebra", () => {
  assert.equal(slugify(""), "");
});

// O que slugify produz tem que passar no mesmo regex que o schema da rota
// POST /businesses aplica no servidor.
test("o slug gerado satisfaz o padrão que a API exige", () => {
  for (const name of ["Barbearia do Zé", "Salão Beleza & Cia", "Studio 22"]) {
    assert.ok(SLUG_PATTERN.test(slugify(name)), name);
  }
});

test("negócio com convite pendente fica pendente; sem, fica ativo", () => {
  assert.equal(businessStatus(row()), "active");
  assert.equal(
    businessStatus(
      row({
        pendingInvites: [
          { id: 12, name: "Zé", email: "ze@x.com", role: "ADMIN" },
        ],
      }),
    ),
    "pending",
  );
});

test("formatTeam concorda o singular e o plural", () => {
  assert.equal(formatTeam(row({ employees: 3, admins: 1 })), "3 colaboradores · 1 admin");
  assert.equal(formatTeam(row({ employees: 1, admins: 2 })), "1 colaborador · 2 admins");
  assert.equal(formatTeam(row({ employees: 0, admins: 0 })), "0 colaboradores · 0 admins");
});
