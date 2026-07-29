import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@prisma/client";
import {
  canEditBusiness,
  canEditEmployeeAvatar,
  normalizeEmail,
  requiresCurrentPassword,
} from "./accountRules";

test("normalizeEmail apara espaços e baixa a caixa", () => {
  assert.equal(normalizeEmail("  Jose@X.com "), "jose@x.com");
  assert.equal(normalizeEmail("JOSE@X.COM"), "jose@x.com");
  assert.equal(normalizeEmail("jose@x.com"), "jose@x.com");
});

test("normalizeEmail de string vazia não quebra", () => {
  assert.equal(normalizeEmail(""), "");
  assert.equal(normalizeEmail("   "), "");
});

test("e-mail diferente exige a senha atual", () => {
  assert.equal(requiresCurrentPassword("jose@x.com", "maria@x.com"), true);
});

test("mesmo e-mail não exige senha", () => {
  assert.equal(requiresCurrentPassword("jose@x.com", "jose@x.com"), false);
});

// Os dois chegam normalizados, então reenviar o mesmo endereço com outra caixa
// ou com espaços não é uma troca e não pode pedir senha à toa.
test("caixa e espaços não contam como troca depois de normalizar", () => {
  const current = normalizeEmail("Jose@X.com");
  const next = normalizeEmail("  jose@x.com  ");

  assert.equal(requiresCurrentPassword(current, next), false);
});

test("admin pode editar o próprio negócio", () => {
  assert.equal(canEditBusiness(1, 1), true);
});

// Este é o invariante multi-tenant central do sistema: o :id da URL nunca
// pode virar uma forma de editar o negócio alheio.
test("admin NÃO pode editar o negócio de outro", () => {
  assert.equal(canEditBusiness(2, 1), false);
  assert.equal(canEditBusiness(1, 2), false);
});

test("usuário sem negócio (SUPERADMIN) não pode editar nenhum", () => {
  assert.equal(canEditBusiness(1, null), false);
});

test("ADMIN edita avatar de quem é do mesmo negócio", () => {
  assert.equal(
    canEditEmployeeAvatar(
      { id: 1, role: Role.ADMIN, businessId: 10 },
      { id: 2, businessId: 10 },
    ),
    true,
  );
});

test("ADMIN não edita avatar de outro negócio", () => {
  assert.equal(
    canEditEmployeeAvatar(
      { id: 1, role: Role.ADMIN, businessId: 10 },
      { id: 2, businessId: 20 },
    ),
    false,
  );
});

test("EMPLOYEE edita só o próprio avatar", () => {
  const actor = { id: 5, role: Role.EMPLOYEE, businessId: 10 };
  assert.equal(canEditEmployeeAvatar(actor, { id: 5, businessId: 10 }), true);
  assert.equal(canEditEmployeeAvatar(actor, { id: 6, businessId: 10 }), false);
});

// SUPERADMIN não pertence a negócio nenhum: sem businessId, "mesmo negócio"
// não existe e a permissão não pode ser concedida por engano.
test("SUPERADMIN não edita avatar de colaborador", () => {
  assert.equal(
    canEditEmployeeAvatar(
      { id: 1, role: Role.SUPERADMIN, businessId: null },
      { id: 2, businessId: 10 },
    ),
    false,
  );
});
