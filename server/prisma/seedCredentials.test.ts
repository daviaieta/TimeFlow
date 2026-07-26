import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSeedCredentials, shouldSeedTestInvite } from "./seedCredentials";

test("em dev, as credenciais padrão servem", () => {
  const credentials = resolveSeedCredentials({ nodeEnv: "development" });

  assert.equal(credentials.email, "superadmin@timeflow.com");
  assert.equal(credentials.password, "SuperAdmin123!");
});

test("em dev, os valores do ambiente ganham do padrão", () => {
  const credentials = resolveSeedCredentials({
    nodeEnv: "development",
    email: "eu@exemplo.com",
    password: "outra-senha",
  });

  assert.equal(credentials.email, "eu@exemplo.com");
  assert.equal(credentials.password, "outra-senha");
});

test("em produção, senha ausente derruba o seed", () => {
  assert.throws(
    () => resolveSeedCredentials({ nodeEnv: "production" }),
    /SEED_SUPERADMIN_PASSWORD/,
  );
});

test("em produção, a senha padrão do repositório é recusada", () => {
  assert.throws(
    () =>
      resolveSeedCredentials({
        nodeEnv: "production",
        password: "SuperAdmin123!",
      }),
    /SEED_SUPERADMIN_PASSWORD/,
  );
});

test("em produção, senha própria é aceita", () => {
  const credentials = resolveSeedCredentials({
    nodeEnv: "production",
    email: "dono@exemplo.com",
    password: "uma-senha-longa-e-aleatoria",
  });

  assert.equal(credentials.password, "uma-senha-longa-e-aleatoria");
});

test("o convite de teste só existe fora de produção", () => {
  assert.equal(shouldSeedTestInvite("development"), true);
  assert.equal(shouldSeedTestInvite("production"), false);
});
