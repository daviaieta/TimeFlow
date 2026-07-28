// Precisa ser o primeiro import: aponta o PrismaClient para o schema de
// teste antes que `../app` construa o singleton. Ver comentário em testDb.ts.
import "./testDb";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { comparePassword, hashPassword } from "../lib/password";
import { hashPasswordResetToken } from "../lib/passwordResetToken";
import { createBusiness } from "./factories";
import { ensureTestSchema, resetDatabase, testPrisma } from "./testDb";

let app: FastifyInstance;

before(async () => {
  await ensureTestSchema();
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
});

// Sem RESEND_API_KEY o mailer entra em modo console: o e-mail não sai, mas o
// token é gravado do mesmo jeito, que é o que estes testes precisam ler.
async function seedUserWithPassword(email: string, password = "SenhaAntiga1") {
  const business = await createBusiness({ slug: `neg-${Date.now()}-${Math.random()}` });

  return testPrisma.user.create({
    data: {
      name: "Pessoa",
      email,
      password: await hashPassword(password),
      role: Role.ADMIN,
      businessId: business.id,
    },
  });
}

function forgot(email: string) {
  return app.inject({
    method: "POST",
    url: "/auth/forgot-password",
    payload: { email },
  });
}

test("pedido de recuperação grava só o hash do token, nunca o token cru", async () => {
  const user = await seedUserWithPassword("alguem@teste.local");

  const response = await forgot(user.email);
  assert.equal(response.statusCode, 204);

  const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(updated.passwordResetTokenHash, "o hash tem que estar gravado");
  assert.ok(updated.passwordResetExpiresAt);
  // 64 caracteres hex é a cara de um SHA-256; o token cru tem 64 bytes (128
  // caracteres). Se algum dia o cru for gravado por engano, isto quebra.
  assert.match(updated.passwordResetTokenHash, /^[a-f0-9]{64}$/);
});

// A defesa contra usar esta rota pública para descobrir quem tem conta.
test("e-mail desconhecido responde igual a e-mail existente", async () => {
  await seedUserWithPassword("existe@teste.local");

  const known = await forgot("existe@teste.local");
  const unknown = await forgot("naoexiste@teste.local");

  assert.equal(known.statusCode, unknown.statusCode);
  assert.equal(known.body, unknown.body);
});

// Quem ainda não aceitou o convite não tem senha para recuperar: o caminho
// dessa pessoa é o link de convite, e emitir os dois criaria duas formas
// concorrentes de ativar a mesma conta.
test("convidado que ainda não definiu senha não recebe token de recuperação", async () => {
  const business = await createBusiness({ slug: "negocio-convite" });
  const invited = await testPrisma.user.create({
    data: {
      name: "Convidado",
      email: "convidado@teste.local",
      password: null,
      role: Role.EMPLOYEE,
      businessId: business.id,
      inviteToken: "token-de-convite",
      inviteTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  assert.equal((await forgot(invited.email)).statusCode, 204);

  const untouched = await testPrisma.user.findUniqueOrThrow({ where: { id: invited.id } });
  assert.equal(untouched.passwordResetTokenHash, null);
  assert.equal(untouched.inviteToken, "token-de-convite");
});

test("token válido troca a senha e devolve sessão", async () => {
  const user = await seedUserWithPassword("troca@teste.local");
  await forgot(user.email);

  // O token cru só existe no e-mail; aqui ele é reconstruído gravando um hash
  // conhecido, que é o mesmo que o servidor vai calcular.
  const token = "a".repeat(64);
  await testPrisma.user.update({
    where: { id: user.id },
    data: { passwordResetTokenHash: hashPasswordResetToken(token) },
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/reset-password",
    payload: { token, password: "SenhaNova123" },
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.json().token, "deve devolver um JWT");

  const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(await comparePassword("SenhaNova123", updated.password ?? ""), true);
  assert.equal(await comparePassword("SenhaAntiga1", updated.password ?? ""), false);
});

test("o token morre depois de usado", async () => {
  const user = await seedUserWithPassword("umavez@teste.local");
  const token = "b".repeat(64);
  await testPrisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: hashPasswordResetToken(token),
      passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const first = await app.inject({
    method: "POST",
    url: "/auth/reset-password",
    payload: { token, password: "SenhaNova123" },
  });
  assert.equal(first.statusCode, 200);

  const second = await app.inject({
    method: "POST",
    url: "/auth/reset-password",
    payload: { token, password: "OutraSenha456" },
  });

  assert.equal(second.statusCode, 401);
  const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(await comparePassword("SenhaNova123", updated.password ?? ""), true);
});

test("token expirado é recusado e a senha antiga continua valendo", async () => {
  const user = await seedUserWithPassword("expirado@teste.local");
  const token = "c".repeat(64);
  await testPrisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: hashPasswordResetToken(token),
      passwordResetExpiresAt: new Date(Date.now() - 1000),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/reset-password",
    payload: { token, password: "SenhaNova123" },
  });

  assert.equal(response.statusCode, 401);
  const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(await comparePassword("SenhaAntiga1", updated.password ?? ""), true);
});

test("token inventado é recusado", async () => {
  await seedUserWithPassword("alvo@teste.local");

  const response = await app.inject({
    method: "POST",
    url: "/auth/reset-password",
    payload: { token: "d".repeat(64), password: "SenhaNova123" },
  });

  assert.equal(response.statusCode, 401);
});

// O e-mail já provou o controle da conta; deixar um convite vivo daria um
// segundo caminho para definir a senha depois da recuperação.
test("recuperar senha invalida convite pendente", async () => {
  const user = await seedUserWithPassword("comconvite@teste.local");
  const token = "e".repeat(64);
  await testPrisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: hashPasswordResetToken(token),
      passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      inviteToken: "convite-vivo",
      inviteTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  await app.inject({
    method: "POST",
    url: "/auth/reset-password",
    payload: { token, password: "SenhaNova123" },
  });

  const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(updated.inviteToken, null);
  assert.equal(updated.inviteTokenExpiresAt, null);
});

test("a senha nova funciona no login", async () => {
  const user = await seedUserWithPassword("login@teste.local");
  const token = "f".repeat(64);
  await testPrisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: hashPasswordResetToken(token),
      passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  await app.inject({
    method: "POST",
    url: "/auth/reset-password",
    payload: { token, password: "SenhaNova123" },
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: user.email, password: "SenhaNova123" },
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.json().token);
});

test("senha curta demais é recusada pelo schema", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/auth/reset-password",
    payload: { token: "x".repeat(64), password: "1234567" },
  });

  assert.equal(response.statusCode, 400);
});
