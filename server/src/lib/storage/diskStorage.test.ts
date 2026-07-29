import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createDiskStorage } from "./diskStorage";

let rootDir: string;

before(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "timeflow-storage-"));
});

after(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

test("put grava criando as pastas do caminho", async () => {
  const storage = createDiskStorage({ rootDir, baseUrl: "http://localhost:3333" });

  await storage.put("businesses/1/logo-abc.webp", Buffer.from("conteudo"), "image/webp");

  const written = await readFile(path.join(rootDir, "businesses/1/logo-abc.webp"));
  assert.equal(written.toString(), "conteudo");
});

test("delete apaga e não reclama se o arquivo já não existe", async () => {
  const storage = createDiskStorage({ rootDir, baseUrl: "http://localhost:3333" });
  await storage.put("businesses/2/logo-x.webp", Buffer.from("x"), "image/webp");

  await storage.delete("businesses/2/logo-x.webp");
  await storage.delete("businesses/2/logo-x.webp");

  await assert.rejects(() => readFile(path.join(rootDir, "businesses/2/logo-x.webp")));
});

test("publicUrl aponta para a rota estática da própria API", () => {
  const storage = createDiskStorage({ rootDir, baseUrl: "http://localhost:3333" });

  assert.equal(
    storage.publicUrl("employees/3/avatar-y.png"),
    "http://localhost:3333/uploads/employees/3/avatar-y.png",
  );
});

// A key vem do banco na hora de apagar. Se um dia entrar lixo lá, o caminho
// não pode escapar da pasta de uploads.
test("recusa key que sobe de diretório", async () => {
  const storage = createDiskStorage({ rootDir, baseUrl: "http://localhost:3333" });

  await assert.rejects(() => storage.delete("../../etc/passwd"), /caminho inválido/i);
});
