import "./testDb";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { MAX_IMAGE_BYTES } from "../services/imageRules";
import { seedBookableBusiness } from "./factories";
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

function tokenFor(user: { id: number; role: Role; businessId: number | null }): string {
  return app.jwt.sign({ sub: user.id, role: user.role, businessId: user.businessId });
}

function pngBytes(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(128),
  ]);
}

const BOUNDARY = "----timeflowtest";

// O app.inject não monta multipart sozinho: o corpo vai montado à mão.
function multipart(bytes: Buffer, filename = "foto.png"): { payload: Buffer; headers: Record<string, string> } {
  const head = Buffer.from(
    `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      "Content-Type: image/png\r\n\r\n",
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);

  return {
    payload: Buffer.concat([head, bytes, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
  };
}

test("ADMIN sobe a logo e recebe a URL pronta", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const { payload, headers } = multipart(pngBytes());

  const response = await app.inject({
    method: "POST",
    url: `/businesses/${alfa.business.id}/logo`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload,
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.match(body.business.logoUrl, /\/uploads\/businesses\/\d+\/logo-[0-9a-f]+\.png$/);

  const saved = await testPrisma.business.findUniqueOrThrow({
    where: { id: alfa.business.id },
  });
  assert.match(saved.logoKey ?? "", /^businesses\/\d+\/logo-[0-9a-f]+\.png$/);
});

test("GET no caminho da logoUrl devolve os bytes que foram salvos", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const bytes = pngBytes();
  const { payload, headers } = multipart(bytes);

  const uploadResponse = await app.inject({
    method: "POST",
    url: `/businesses/${alfa.business.id}/logo`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload,
  });

  const logoUrl = uploadResponse.json().business.logoUrl as string;
  // app.inject não fala HTTP de verdade: só o caminho, sem origem.
  const path = new URL(logoUrl).pathname;

  const getResponse = await app.inject({ method: "GET", url: path });

  assert.equal(getResponse.statusCode, 200);
  assert.ok(getResponse.rawPayload.equals(bytes));
});

test("arquivo que não é imagem responde 400 e não grava nada", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const { payload, headers } = multipart(Buffer.from("nao sou imagem"), "malicioso.png");

  const response = await app.inject({
    method: "POST",
    url: `/businesses/${alfa.business.id}/logo`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload,
  });

  assert.equal(response.statusCode, 400);
  const saved = await testPrisma.business.findUniqueOrThrow({
    where: { id: alfa.business.id },
  });
  assert.equal(saved.logoKey, null);
});

test("ADMIN de outro negócio não sobe banner e não altera nada", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const beta = await seedBookableBusiness("beta");
  const { payload, headers } = multipart(pngBytes());

  const response = await app.inject({
    method: "POST",
    url: `/businesses/${beta.business.id}/banner`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload,
  });

  assert.equal(response.statusCode, 403);
  const untouched = await testPrisma.business.findUniqueOrThrow({
    where: { id: beta.business.id },
  });
  assert.equal(untouched.bannerKey, null);
});

test("DELETE limpa a key da logo", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const { payload, headers } = multipart(pngBytes());
  await app.inject({
    method: "POST",
    url: `/businesses/${alfa.business.id}/logo`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload,
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/businesses/${alfa.business.id}/logo`,
    headers: { authorization: `Bearer ${tokenFor(alfa.admin)}` },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().business.logoUrl, null);
  const saved = await testPrisma.business.findUniqueOrThrow({
    where: { id: alfa.business.id },
  });
  assert.equal(saved.logoKey, null);
});

test("EMPLOYEE sobe o próprio avatar", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const { payload, headers } = multipart(pngBytes());

  const response = await app.inject({
    method: "POST",
    url: `/employees/${alfa.employee.id}/avatar`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.employee)}` },
    payload,
  });

  assert.equal(response.statusCode, 200);
  assert.match(
    response.json().employee.avatarUrl,
    /\/uploads\/employees\/\d+\/avatar-[0-9a-f]+\.png$/,
  );

  const saved = await testPrisma.user.findUniqueOrThrow({
    where: { id: alfa.employee.id },
  });
  assert.match(saved.avatarKey ?? "", /^employees\/\d+\/avatar-[0-9a-f]+\.png$/);
});

test("ADMIN sobe o avatar de um colaborador do próprio negócio", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const { payload, headers } = multipart(pngBytes());

  const response = await app.inject({
    method: "POST",
    url: `/employees/${alfa.employee.id}/avatar`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload,
  });

  assert.equal(response.statusCode, 200);
});

// 404 e não 403: um 403 confirmaria que aquele id existe em algum lugar.
test("ADMIN de outro negócio recebe 404 no avatar alheio", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const beta = await seedBookableBusiness("beta");
  const { payload, headers } = multipart(pngBytes());

  const response = await app.inject({
    method: "POST",
    url: `/employees/${beta.employee.id}/avatar`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload,
  });

  assert.equal(response.statusCode, 404);
  const untouched = await testPrisma.user.findUniqueOrThrow({
    where: { id: beta.employee.id },
  });
  assert.equal(untouched.avatarKey, null);
});

// Mesma lógica do teste do ADMIN acima, mas para EMPLOYEE: sem essa checagem
// de negócio no service, o 403 de "não pode editar" vazaria que aquele id de
// outro negócio existe — por isso a resposta tem que ser 404, igual à do
// ADMIN.
test("EMPLOYEE de outro negócio recebe 404 no avatar alheio", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const beta = await seedBookableBusiness("beta");
  const { payload, headers } = multipart(pngBytes());

  const response = await app.inject({
    method: "POST",
    url: `/employees/${beta.employee.id}/avatar`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.employee)}` },
    payload,
  });

  assert.equal(response.statusCode, 404);
  const untouched = await testPrisma.user.findUniqueOrThrow({
    where: { id: beta.employee.id },
  });
  assert.equal(untouched.avatarKey, null);
});

// seedBookableBusiness só cria um EMPLOYEE por negócio, então o alvo "outra
// pessoa do mesmo negócio" aqui é o ADMIN — ele existe, só não pode ser
// editado por um EMPLOYEE, daí o 403 (e não 404).
test("EMPLOYEE não mexe no avatar de outra pessoa do mesmo negócio", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const { payload, headers } = multipart(pngBytes());

  const response = await app.inject({
    method: "POST",
    url: `/employees/${alfa.admin.id}/avatar`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.employee)}` },
    payload,
  });

  assert.equal(response.statusCode, 403);
  const untouched = await testPrisma.user.findUniqueOrThrow({
    where: { id: alfa.admin.id },
  });
  assert.equal(untouched.avatarKey, null);
});

test("DELETE limpa a key do avatar", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const { payload, headers } = multipart(pngBytes());
  await app.inject({
    method: "POST",
    url: `/employees/${alfa.employee.id}/avatar`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.employee)}` },
    payload,
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/employees/${alfa.employee.id}/avatar`,
    headers: { authorization: `Bearer ${tokenFor(alfa.employee)}` },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().employee.avatarUrl, null);
  const saved = await testPrisma.user.findUniqueOrThrow({
    where: { id: alfa.employee.id },
  });
  assert.equal(saved.avatarKey, null);
});

test("upload maior que 2 MB responde 4xx em português e não grava nada", async () => {
  const alfa = await seedBookableBusiness("alfa");
  const oversizedBytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(MAX_IMAGE_BYTES + 1024),
  ]);
  const { payload, headers } = multipart(oversizedBytes);

  const response = await app.inject({
    method: "POST",
    url: `/businesses/${alfa.business.id}/logo`,
    headers: { ...headers, authorization: `Bearer ${tokenFor(alfa.admin)}` },
    payload,
  });

  assert.ok(response.statusCode >= 400 && response.statusCode < 500);
  assert.equal(response.json().message, "A imagem precisa ter no máximo 2 MB.");

  const saved = await testPrisma.business.findUniqueOrThrow({
    where: { id: alfa.business.id },
  });
  assert.equal(saved.logoKey, null);
});
