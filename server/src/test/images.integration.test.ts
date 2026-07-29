import "./testDb";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { buildApp } from "../app";
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
