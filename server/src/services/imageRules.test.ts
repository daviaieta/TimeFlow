import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestError } from "../lib/errors";
import {
  MAX_IMAGE_BYTES,
  buildImageKey,
  detectImageKind,
  validateImageUpload,
} from "./imageRules";

function jpeg(): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
}

function png(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64),
  ]);
}

function webp(): Buffer {
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(1024, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, Buffer.alloc(64)]);
}

test("detectImageKind reconhece JPEG, PNG e WebP pela assinatura", () => {
  assert.equal(detectImageKind(jpeg()), "jpeg");
  assert.equal(detectImageKind(png()), "png");
  assert.equal(detectImageKind(webp()), "webp");
});

// O Content-Type vem do cliente e mente. Um .txt renomeado para .jpg chega
// como image/jpeg e precisa cair aqui, não no bucket.
test("detectImageKind devolve null para conteúdo que não é imagem", () => {
  assert.equal(detectImageKind(Buffer.from("<?php system($_GET['c']); ?>")), null);
  assert.equal(detectImageKind(Buffer.alloc(0)), null);
});

// RIFF sozinho é container de WAV/AVI também: sem conferir "WEBP" no byte 8,
// um áudio passaria por imagem.
test("detectImageKind recusa RIFF que não é WEBP", () => {
  const wav = Buffer.alloc(16);
  wav.write("RIFF", 0, "ascii");
  wav.write("WAVE", 8, "ascii");
  assert.equal(detectImageKind(wav), null);
});

test("validateImageUpload devolve o tipo quando o arquivo é válido", () => {
  assert.equal(validateImageUpload(png()), "png");
});

test("validateImageUpload recusa arquivo vazio", () => {
  assert.throws(() => validateImageUpload(Buffer.alloc(0)), BadRequestError);
});

test("validateImageUpload recusa acima do limite", () => {
  const tooBig = Buffer.concat([jpeg(), Buffer.alloc(MAX_IMAGE_BYTES)]);
  assert.throws(() => validateImageUpload(tooBig), BadRequestError);
});

test("validateImageUpload recusa formato desconhecido", () => {
  assert.throws(() => validateImageUpload(Buffer.from("GIF89a")), BadRequestError);
});

test("buildImageKey separa negócio de colaborador e usa a extensão do tipo", () => {
  assert.equal(
    buildImageKey({ slot: "logo", ownerId: 7, kind: "webp", random: "abc123" }),
    "businesses/7/logo-abc123.webp",
  );
  assert.equal(
    buildImageKey({ slot: "banner", ownerId: 7, kind: "jpeg", random: "abc123" }),
    "businesses/7/banner-abc123.jpg",
  );
  assert.equal(
    buildImageKey({ slot: "avatar", ownerId: 42, kind: "png", random: "abc123" }),
    "employees/42/avatar-abc123.png",
  );
});
