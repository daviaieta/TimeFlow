import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@prisma/client";
import {
  BusinessBaseRow,
  PendingInviteRow,
  RoleCountRow,
  buildBusinessRows,
  buildPlatformTotals,
} from "./platformRules";

function business(overrides: Partial<BusinessBaseRow> = {}): BusinessBaseRow {
  return {
    id: 1,
    name: "Barbearia do Zé",
    slug: "barbearia-do-ze",
    createdAt: new Date("2026-07-20T14:03:11.000Z"),
    ...overrides,
  };
}

function count(
  businessId: number | null,
  role: Role,
  total: number,
): RoleCountRow {
  return { businessId, role, _count: { _all: total } };
}

function pending(overrides: Partial<PendingInviteRow> = {}): PendingInviteRow {
  return {
    id: 12,
    name: "Zé",
    email: "ze@x.com",
    role: Role.ADMIN,
    businessId: 1,
    ...overrides,
  };
}

test("negócio sem nenhum usuário zera as contagens em vez de virar undefined", () => {
  const rows = buildBusinessRows([business()], [], []);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].employees, 0);
  assert.equal(rows[0].admins, 0);
  assert.deepEqual(rows[0].pendingInvites, []);
});

test("contagens caem no negócio certo, por papel", () => {
  const rows = buildBusinessRows(
    [business({ id: 1 }), business({ id: 2, slug: "outra" })],
    [
      count(1, Role.EMPLOYEE, 3),
      count(1, Role.ADMIN, 1),
      count(2, Role.EMPLOYEE, 5),
    ],
    [],
  );

  assert.equal(rows[0].employees, 3);
  assert.equal(rows[0].admins, 1);
  assert.equal(rows[1].employees, 5);
  assert.equal(rows[1].admins, 0);
});

test("negócio com dois admins conta dois", () => {
  const rows = buildBusinessRows([business()], [count(1, Role.ADMIN, 2)], []);

  assert.equal(rows[0].admins, 2);
});

// O seed cria um ADMIN órfão (convite-teste@timeflow.com) sem businessId.
// Ele não pertence a negócio nenhum e não pode inflar contagem de ninguém.
test("usuário sem businessId não entra em linha nenhuma", () => {
  const rows = buildBusinessRows(
    [business()],
    [count(null, Role.ADMIN, 9), count(null, Role.SUPERADMIN, 1)],
    [pending({ id: 99, businessId: null })],
  );

  assert.equal(rows[0].admins, 0);
  assert.deepEqual(rows[0].pendingInvites, []);
});

test("convite pendente aparece na linha certa, com id e email", () => {
  const rows = buildBusinessRows(
    [business({ id: 1 }), business({ id: 2, slug: "outra" })],
    [],
    [pending({ id: 12, businessId: 1 }), pending({ id: 13, businessId: 2 })],
  );

  assert.deepEqual(rows[0].pendingInvites, [
    { id: 12, name: "Zé", email: "ze@x.com", role: Role.ADMIN },
  ]);
  assert.equal(rows[1].pendingInvites[0].id, 13);
});

test("createdAt sai como string ISO, pronto para o JSON", () => {
  const rows = buildBusinessRows([business()], [], []);

  assert.equal(rows[0].createdAt, "2026-07-20T14:03:11.000Z");
});

test("a ordem que veio do banco é preservada pelo merge", () => {
  const rows = buildBusinessRows(
    [business({ id: 7, slug: "sete" }), business({ id: 3, slug: "tres" })],
    [],
    [],
  );

  assert.deepEqual(
    rows.map((row) => row.id),
    [7, 3],
  );
});

test("totais somam as linhas", () => {
  const rows = buildBusinessRows(
    [business({ id: 1 }), business({ id: 2, slug: "outra" })],
    [
      count(1, Role.EMPLOYEE, 3),
      count(1, Role.ADMIN, 1),
      count(2, Role.EMPLOYEE, 5),
      count(2, Role.ADMIN, 2),
    ],
    [pending({ id: 12, businessId: 1 }), pending({ id: 13, businessId: 2 })],
  );

  assert.deepEqual(buildPlatformTotals(rows), {
    businesses: 2,
    employees: 8,
    admins: 3,
    pendingInvites: 2,
  });
});

test("plataforma vazia devolve zeros, não NaN", () => {
  assert.deepEqual(buildPlatformTotals([]), {
    businesses: 0,
    employees: 0,
    admins: 0,
    pendingInvites: 0,
  });
});
