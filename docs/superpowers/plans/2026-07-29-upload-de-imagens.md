# Upload de imagens — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o dono suba logo e banner do negócio e que colaboradores tenham foto, com os arquivos guardados no Cloudflare R2 em produção e em disco no desenvolvimento.

**Architecture:** O banco guarda a *key* do objeto (`logoKey`, `bannerKey`, `avatarKey`), nunca a URL; a URL pública é montada na camada de service e sai pronta no JSON. O upload chega por `multipart/form-data`, é validado por magic bytes no servidor e gravado através da interface `ObjectStorage`, que tem duas implementações escolhidas pela presença das credenciais do R2 — o mesmo padrão do mailer. O front converte e redimensiona a imagem no `<canvas>` antes de subir.

**Tech Stack:** Fastify, `@fastify/multipart`, `@fastify/static`, Prisma, `@aws-sdk/client-s3` (R2 é S3-compatível), `node:test`; Next.js App Router, React, Tailwind.

Spec: `docs/superpowers/specs/2026-07-29-upload-de-imagens-design.md`

## Global Constraints

- Limite de arquivo: **2 MB** (`MAX_IMAGE_BYTES = 2 * 1024 * 1024`).
- Formatos aceitos: **JPEG, PNG, WebP**, detectados por magic bytes — nunca pelo `Content-Type` do cliente.
- Todo schema JSON de rota novo leva `additionalProperties: false`.
- Toda ação de `ADMIN`/`EMPLOYEE` é restrita ao `businessId` do token. Alvo de outro negócio responde **404** (não 403): responder 403 confirmaria que aquele id existe. Isto refina a tabela de erros da spec, que dizia 403 — o 403 fica só para o caso "mesmo negócio, mas você é EMPLOYEE mexendo em avatar alheio".
- Textos de UI e mensagens de erro para o usuário final em **português**; nomes de código em inglês, como no resto do repositório.
- Comentários no código explicam **por quê**, não o quê — é o padrão do repositório.
- Nenhum `console.log` de credencial ou de key em produção.
- Commits em português, prefixo convencional (`feat:`, `test:`, `docs:`, `chore:`).

---

## File Structure

**Servidor — criar**

| Arquivo | Responsabilidade |
| --- | --- |
| `server/src/services/imageRules.ts` | Puro: detectar tipo por assinatura, validar tamanho, montar a key. |
| `server/src/services/imageRules.test.ts` | Testes do acima. |
| `server/src/services/imageService.ts` | Cola entre regra pura e storage: grava, apaga, monta URL. |
| `server/src/lib/storage/types.ts` | Interface `ObjectStorage` e mapa de content-type. |
| `server/src/lib/storage/storageConfig.ts` | Puro: decide entre R2 e disco a partir do ambiente. |
| `server/src/lib/storage/storageConfig.test.ts` | Testes do acima. |
| `server/src/lib/storage/diskStorage.ts` | Implementação em disco (desenvolvimento). |
| `server/src/lib/storage/diskStorage.test.ts` | Testes do acima. |
| `server/src/lib/storage/r2Storage.ts` | Implementação R2 via `@aws-sdk/client-s3`. |
| `server/src/lib/storage/index.ts` | `getStorage()` — instância única, criada na primeira chamada. |
| `server/src/test/images.integration.test.ts` | Upload ponta a ponta e isolamento entre negócios. |

**Servidor — modificar**

`prisma/schema.prisma`, `src/config/env.ts`, `src/app.ts`, `src/lib/errors.ts` (nada a mudar — só conferir), `src/repositories/businessRepository.ts`, `src/repositories/employeeRepository.ts`, `src/repositories/userRepository.ts`, `src/repositories/dashboardRepository.ts`, `src/services/accountRules.ts` (+ test), `src/services/businessService.ts`, `src/services/employeeService.ts`, `src/services/authService.ts`, `src/services/publicBookingRules.ts` (+ test), `src/services/publicBookingService.ts`, `src/services/dashboardRules.ts` (+ test), `src/services/dashboardService.ts`, `src/controllers/businessController.ts`, `src/controllers/employeeController.ts`, `src/routes/businessRoutes.ts`, `src/routes/employeeRoutes.ts`, `src/test/testDb.ts`, `.env.example`, `.gitignore`.

**Web — criar**

| Arquivo | Responsabilidade |
| --- | --- |
| `web/lib/image.ts` | Puro: matemática de recorte "cover" e limites de dimensão. |
| `web/lib/image.test.ts` | Testes do acima. |
| `web/lib/imageFile.ts` | Redimensiona e converte para WebP num `<canvas>` (só browser). |
| `web/components/image-upload-field.tsx` | Campo reusável: preview, trocar, remover, erro. |

**Web — modificar**

`web/adapters/fetchAdapter.ts`, `web/lib/auth.ts`, `web/lib/types.ts`, `web/lib/publicBooking.ts`, `web/lib/dashboard.ts`, `web/app/dashboard/settings/business-card.tsx`, `web/app/dashboard/settings/profile-card.tsx`, `web/app/dashboard/team/employee-card.tsx`, `web/app/dashboard/layout.tsx`, `web/components/dashboard/team-table.tsx`, `web/app/[slug]/showcase-hero.tsx`, `web/app/[slug]/team-section.tsx`, `web/app/[slug]/employee-picker.tsx`.

**Nota:** `BusinessMark` e `TeamAvatar` já aceitam a prop `src` com o comentário "Reservado para a Fase 2". Esta é a Fase 2 — os componentes não mudam, só passam a receber a prop, e o comentário sai.

---

## Task 1: Schema e migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_add_image_keys/migration.sql` (gerado pelo Prisma)

**Interfaces:**
- Consumes: nada.
- Produces: `Business.logoKey`, `Business.bannerKey`, `User.avatarKey` — todos `String?`, disponíveis no `PrismaClient` tipado.

- [ ] **Step 1: Adicionar os campos ao schema**

Em `server/prisma/schema.prisma`, dentro de `model Business`, logo abaixo de `address`:

```prisma
  // Key do objeto no bucket, não URL. A URL pública é montada na camada de
  // service a partir de R2_PUBLIC_URL — trocar de bucket ou de domínio vira
  // uma variável de ambiente em vez de um UPDATE em todas as linhas.
  logoKey   String?
  bannerKey String?
```

Dentro de `model User`, logo abaixo de `updatedAt`:

```prisma
  // Mesma razão do logoKey do Business: guarda a key, não a URL.
  avatarKey String?
```

- [ ] **Step 2: Gerar a migration**

Run: `cd server && npm run db:migrate -- --name add_image_keys`
Expected: cria `prisma/migrations/<timestamp>_add_image_keys/migration.sql` com três `ALTER TABLE ... ADD COLUMN`, e aplica no banco local.

- [ ] **Step 3: Conferir que os tipos chegaram no client**

Run: `cd server && npm run typecheck`
Expected: sai sem erro.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): guarda a key da logo, do banner e do avatar"
```

---

## Task 2: Regras puras de imagem

**Files:**
- Create: `server/src/services/imageRules.ts`
- Test: `server/src/services/imageRules.test.ts`

**Interfaces:**
- Consumes: `BadRequestError` de `server/src/lib/errors.ts`.
- Produces:
  - `type ImageKind = "jpeg" | "png" | "webp"`
  - `type ImageSlot = "logo" | "banner" | "avatar"`
  - `const MAX_IMAGE_BYTES: number`
  - `function detectImageKind(bytes: Buffer): ImageKind | null`
  - `function validateImageUpload(bytes: Buffer): ImageKind` (lança `BadRequestError`)
  - `function buildImageKey(input: { slot: ImageSlot; ownerId: number; kind: ImageKind; random: string }): string`

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/src/services/imageRules.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node --import tsx --test src/services/imageRules.test.ts`
Expected: FAIL — `Cannot find module './imageRules'`.

- [ ] **Step 3: Implementar**

Criar `server/src/services/imageRules.ts`:

```ts
import { BadRequestError } from "../lib/errors";

export type ImageKind = "jpeg" | "png" | "webp";
export type ImageSlot = "logo" | "banner" | "avatar";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<ImageKind, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Assinatura do arquivo, nunca o Content-Type: o header é escrito pelo cliente
// e um executável renomeado chega dizendo ser image/png.
export function detectImageKind(bytes: Buffer): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }

  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }

  // RIFF também abre WAV e AVI — o "WEBP" no byte 8 é o que separa.
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

export function validateImageUpload(bytes: Buffer): ImageKind {
  if (bytes.length === 0) {
    throw new BadRequestError("Envie um arquivo de imagem.");
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new BadRequestError("A imagem precisa ter no máximo 2 MB.");
  }

  const kind = detectImageKind(bytes);
  if (!kind) {
    throw new BadRequestError("Formato não suportado. Envie JPG, PNG ou WebP.");
  }

  return kind;
}

// O sufixo aleatório faz duas coisas: impede adivinhar a imagem de outro
// negócio pela URL e garante que a troca não seja servida do cache com a
// foto antiga.
export function buildImageKey(input: {
  slot: ImageSlot;
  ownerId: number;
  kind: ImageKind;
  random: string;
}): string {
  const folder = input.slot === "avatar" ? "employees" : "businesses";
  return `${folder}/${input.ownerId}/${input.slot}-${input.random}.${EXTENSIONS[input.kind]}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node --import tsx --test src/services/imageRules.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/imageRules.ts server/src/services/imageRules.test.ts
git commit -m "feat(server): valida imagem por magic bytes e monta a key do objeto"
```

---

## Task 3: Camada de storage

**Files:**
- Create: `server/src/lib/storage/types.ts`, `storageConfig.ts`, `storageConfig.test.ts`, `diskStorage.ts`, `diskStorage.test.ts`, `r2Storage.ts`, `index.ts`
- Modify: `server/src/config/env.ts`, `server/.env.example`, `server/.gitignore`, `server/package.json` (dependência)

**Interfaces:**
- Consumes: `ImageKind` de `services/imageRules.ts`.
- Produces:
  - `interface ObjectStorage { put(key: string, body: Buffer, contentType: string): Promise<void>; delete(key: string): Promise<void>; publicUrl(key: string): string }`
  - `const CONTENT_TYPES: Record<ImageKind, string>`
  - `type StorageConfig = { mode: "disk"; rootDir: string; baseUrl: string } | { mode: "r2"; accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string }`
  - `function resolveStorageConfig(source: NodeJS.ProcessEnv, fallback: { rootDir: string; baseUrl: string }): StorageConfig`
  - `function createDiskStorage(config: { rootDir: string; baseUrl: string }): ObjectStorage`
  - `function createR2Storage(config: Extract<StorageConfig, { mode: "r2" }>): ObjectStorage`
  - `function getStorage(): ObjectStorage`
  - `env.storage: StorageConfig`

- [ ] **Step 1: Instalar o SDK**

Run: `cd server && npm install @aws-sdk/client-s3`
Expected: entra em `dependencies`. É o cliente S3 — o R2 fala o mesmo protocolo, não existe SDK próprio da Cloudflare para Node que valha a pena aqui.

- [ ] **Step 2: Escrever o teste que falha (configuração)**

Criar `server/src/lib/storage/storageConfig.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveStorageConfig } from "./storageConfig";

const FALLBACK = { rootDir: "/tmp/uploads", baseUrl: "http://localhost:3333" };

const FULL_R2 = {
  R2_ACCOUNT_ID: "acc",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "timeflow",
  R2_PUBLIC_URL: "https://cdn.exemplo.com/",
};

test("sem nenhuma variável do R2, cai no disco", () => {
  assert.deepEqual(resolveStorageConfig({}, FALLBACK), {
    mode: "disk",
    rootDir: "/tmp/uploads",
    baseUrl: "http://localhost:3333",
  });
});

test("com todas as variáveis, usa R2 e tira a barra final da URL pública", () => {
  assert.deepEqual(resolveStorageConfig(FULL_R2, FALLBACK), {
    mode: "r2",
    accountId: "acc",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucket: "timeflow",
    publicUrl: "https://cdn.exemplo.com",
  });
});

// Falha fechado: configuração pela metade em produção gravaria no disco
// efêmero do container e as fotos sumiriam no deploy seguinte, sem erro.
test("com configuração pela metade, explode dizendo o que falta", () => {
  const partial = { R2_ACCOUNT_ID: "acc", R2_BUCKET: "timeflow" };

  assert.throws(
    () => resolveStorageConfig(partial, FALLBACK),
    /R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*R2_PUBLIC_URL/s,
  );
});

test("variável presente mas vazia conta como ausente", () => {
  assert.equal(resolveStorageConfig({ R2_BUCKET: "   " }, FALLBACK).mode, "disk");
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd server && node --import tsx --test src/lib/storage/storageConfig.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar tipos e configuração**

Criar `server/src/lib/storage/types.ts`:

```ts
import { ImageKind } from "../../services/imageRules";

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export const CONTENT_TYPES: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
```

Criar `server/src/lib/storage/storageConfig.ts`:

```ts
export type StorageConfig =
  | { mode: "disk"; rootDir: string; baseUrl: string }
  | {
      mode: "r2";
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
      publicUrl: string;
    };

const R2_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const;

function filled(source: NodeJS.ProcessEnv, name: string): boolean {
  return (source[name] ?? "").trim() !== "";
}

// Tudo ou nada. Meia configuração em produção gravaria no disco do container
// do Railway, que é apagado a cada deploy: as fotos sumiriam sem um único
// erro no log.
export function resolveStorageConfig(
  source: NodeJS.ProcessEnv,
  fallback: { rootDir: string; baseUrl: string },
): StorageConfig {
  const present = R2_VARS.filter((name) => filled(source, name));

  if (present.length === 0) {
    return { mode: "disk", rootDir: fallback.rootDir, baseUrl: fallback.baseUrl };
  }

  if (present.length < R2_VARS.length) {
    const missing = R2_VARS.filter((name) => !filled(source, name));
    throw new Error(
      `Configuração do Cloudflare R2 incompleta: faltam ${missing.join(", ")}. ` +
        "Defina todas as variáveis ou nenhuma (nenhuma = armazenamento em disco, só para desenvolvimento).",
    );
  }

  return {
    mode: "r2",
    accountId: source.R2_ACCOUNT_ID!.trim(),
    accessKeyId: source.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: source.R2_SECRET_ACCESS_KEY!.trim(),
    bucket: source.R2_BUCKET!.trim(),
    // Sem a barra final: quem monta a URL sempre concatena "/" + key.
    publicUrl: source.R2_PUBLIC_URL!.trim().replace(/\/+$/, ""),
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd server && node --import tsx --test src/lib/storage/storageConfig.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 6: Escrever o teste que falha (disco)**

Criar `server/src/lib/storage/diskStorage.test.ts`:

```ts
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
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `cd server && node --import tsx --test src/lib/storage/diskStorage.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 8: Implementar o storage em disco**

Criar `server/src/lib/storage/diskStorage.ts`:

```ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ObjectStorage } from "./types";

function resolveInside(rootDir: string, key: string): string {
  const target = path.resolve(rootDir, key);
  const root = path.resolve(rootDir);

  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Caminho inválido para o storage: ${key}`);
  }

  return target;
}

// Usado só em desenvolvimento: o disco do container em produção é apagado a
// cada deploy. A escolha entre isto e o R2 está em storageConfig.
export function createDiskStorage(config: {
  rootDir: string;
  baseUrl: string;
}): ObjectStorage {
  return {
    async put(key, body) {
      const target = resolveInside(config.rootDir, key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    },

    async delete(key) {
      await rm(resolveInside(config.rootDir, key), { force: true });
    },

    publicUrl(key) {
      return `${config.baseUrl}/uploads/${key}`;
    },
  };
}
```

- [ ] **Step 9: Rodar e ver passar**

Run: `cd server && node --import tsx --test src/lib/storage/diskStorage.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 10: Implementar o storage do R2**

Criar `server/src/lib/storage/r2Storage.ts`. Sem teste unitário: seria só verificar que o SDK foi chamado com o objeto certo, e a integração real depende de credencial. A cobertura vem do `diskStorage` (mesma interface) e do teste manual descrito na Task 11.

```ts
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { StorageConfig } from "./storageConfig";
import { ObjectStorage } from "./types";

type R2Config = Extract<StorageConfig, { mode: "r2" }>;

export function createR2Storage(config: R2Config): ObjectStorage {
  const client = new S3Client({
    // O R2 não tem regiões no sentido da AWS, mas o SDK exige o campo.
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // A key já carrega um sufixo aleatório novo a cada troca, então o
          // objeto nunca é sobrescrito: cache longo é seguro.
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },

    publicUrl(key) {
      return `${config.publicUrl}/${key}`;
    },
  };
}
```

- [ ] **Step 11: Ligar no ambiente**

Em `server/src/config/env.ts`, adicionar no topo:

```ts
import path from "node:path";
import { resolveStorageConfig } from "../lib/storage/storageConfig";
```

E, dentro do objeto `env`, depois de `contactInbox`:

```ts
  // Resolvido no boot de propósito: configuração do R2 pela metade derruba o
  // servidor agora, em vez de silenciosamente gravar no disco efêmero e só
  // dar sinal quando as fotos sumirem.
  storage: resolveStorageConfig(process.env, {
    rootDir: process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads"),
    baseUrl: (process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3333}`).replace(
      /\/+$/,
      "",
    ),
  }),
```

Criar `server/src/lib/storage/index.ts`:

```ts
import { env } from "../../config/env";
import { createDiskStorage } from "./diskStorage";
import { createR2Storage } from "./r2Storage";
import { ObjectStorage } from "./types";

let instance: ObjectStorage | null = null;

// Preguiçoso: o cliente do S3 só nasce no primeiro upload. A validação da
// configuração, essa sim, já rodou no boot (config/env.ts).
export function getStorage(): ObjectStorage {
  if (!instance) {
    instance =
      env.storage.mode === "r2" ? createR2Storage(env.storage) : createDiskStorage(env.storage);
  }

  return instance;
}

export * from "./types";
```

- [ ] **Step 12: Documentar as variáveis e ignorar a pasta**

Em `server/.env.example`, no fim do arquivo:

```
# Cloudflare R2 — armazenamento das imagens (logo, banner, avatar). É tudo ou
# nada: sem nenhuma delas o servidor grava em `server/uploads/` e serve em
# /uploads, o que só serve para desenvolvimento — o disco do container em
# produção é apagado a cada deploy. Com algumas mas não todas, o servidor
# recusa subir.
# R2_ACCOUNT_ID=""
# R2_ACCESS_KEY_ID=""
# R2_SECRET_ACCESS_KEY=""
# R2_BUCKET=""
# R2_PUBLIC_URL=""

# Pasta do armazenamento em disco (desenvolvimento). Default: server/uploads.
# UPLOADS_DIR=""

# URL pública da própria API, usada para montar o link das imagens servidas
# em disco. Em produção com R2 não é usada.
# PUBLIC_API_URL=""
```

Em `server/.gitignore`, adicionar:

```
uploads/
```

- [ ] **Step 13: Rodar a suíte inteira e o typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS, sem erro de tipo.

- [ ] **Step 14: Commit**

```bash
git add server/src/lib/storage server/src/config/env.ts server/.env.example server/.gitignore server/package.json server/package-lock.json
git commit -m "feat(server): adiciona storage de objetos com R2 e disco"
```

---

## Task 4: Upload de logo e banner do negócio

**Files:**
- Create: `server/src/services/imageService.ts`
- Modify: `server/src/app.ts`, `server/src/repositories/businessRepository.ts`, `server/src/services/businessService.ts`, `server/src/controllers/businessController.ts`, `server/src/routes/businessRoutes.ts`, `server/src/test/testDb.ts`
- Test: `server/src/test/images.integration.test.ts`

**Interfaces:**
- Consumes: `validateImageUpload`, `buildImageKey`, `MAX_IMAGE_BYTES`, `ImageSlot` (Task 2); `getStorage`, `CONTENT_TYPES` (Task 3); `canEditBusiness` de `services/accountRules.ts`.
- Produces:
  - `imageService.storeImage(input: { slot: ImageSlot; ownerId: number; bytes: Buffer }): Promise<string>` — devolve a key.
  - `imageService.discardImage(key: string | null): Promise<void>`
  - `imageService.imageUrl(key: string | null): string | null`
  - `businessRepository.setImageKey(id: number, slot: "logo" | "banner", key: string | null)`
  - `businessService.updateBusinessImage(businessId, userBusinessId, slot, bytes)` e `removeBusinessImage(businessId, userBusinessId, slot)` — ambos devolvem `{ id, logoUrl, bannerUrl }`.
  - Rotas `POST|DELETE /businesses/:id/logo` e `/businesses/:id/banner`.

- [ ] **Step 1: Instalar os plugins**

Run: `cd server && npm install @fastify/multipart @fastify/static`
Expected: ambos em `dependencies`.

- [ ] **Step 2: Escrever o teste de integração que falha**

Criar `server/src/test/images.integration.test.ts`:

```ts
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
```

- [ ] **Step 3: Apontar o storage de teste para uma pasta temporária**

Em `server/src/test/testDb.ts`, logo depois da linha `process.env.DATABASE_URL = testDatabaseUrl;`:

```ts
// Mesma razão da ordem de import acima: `config/env` resolve a configuração
// de storage na avaliação do módulo. Sem isto, o teste escreveria em
// `server/uploads/` e sujaria a pasta de desenvolvimento.
process.env.UPLOADS_DIR ??= path.join(tmpdir(), "timeflow-test-uploads");
```

E os imports no topo do arquivo:

```ts
import { tmpdir } from "node:os";
import path from "node:path";
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd server && npm run pretest:integration && node --import tsx --test --test-concurrency=1 src/test/images.integration.test.ts`
Expected: FAIL — as quatro rotas respondem 404.

- [ ] **Step 5: Implementar o imageService**

Criar `server/src/services/imageService.ts`:

```ts
import { randomBytes } from "node:crypto";
import { CONTENT_TYPES, getStorage } from "../lib/storage";
import { ImageSlot, buildImageKey, validateImageUpload } from "./imageRules";

export const imageService = {
  async storeImage(input: {
    slot: ImageSlot;
    ownerId: number;
    bytes: Buffer;
  }): Promise<string> {
    const kind = validateImageUpload(input.bytes);
    const key = buildImageKey({
      slot: input.slot,
      ownerId: input.ownerId,
      kind,
      random: randomBytes(8).toString("hex"),
    });

    await getStorage().put(key, input.bytes, CONTENT_TYPES[kind]);

    return key;
  },

  // Best-effort: objeto órfão no bucket custa centavos, derrubar a troca de
  // foto por causa dele custa a confiança de quem clicou.
  async discardImage(key: string | null): Promise<void> {
    if (!key) return;

    try {
      await getStorage().delete(key);
    } catch (error) {
      console.error(`Falha ao apagar o objeto ${key}:`, error);
    }
  },

  imageUrl(key: string | null): string | null {
    return key ? getStorage().publicUrl(key) : null;
  },
};
```

- [ ] **Step 6: Registrar multipart e a rota estática**

Em `server/src/app.ts`, adicionar aos imports:

```ts
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { MAX_IMAGE_BYTES } from "./services/imageRules";
```

E, depois de `app.register(fastifyJwt, ...)`:

```ts
  app.register(fastifyMultipart, {
    // O plugin corta o stream no limite: um arquivo gigante nunca chega a
    // virar Buffer na memória do processo.
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  });

  // Só no modo disco. Em produção quem serve as imagens é o R2, e expor uma
  // pasta que nem existe seria só superfície a mais.
  if (env.storage.mode === "disk") {
    app.register(fastifyStatic, {
      root: env.storage.rootDir,
      prefix: "/uploads/",
      // A pasta pode não existir ainda no primeiro boot.
      wildcard: false,
    });
  }
```

- [ ] **Step 7: Implementar repositório, service, controller e rotas**

Em `server/src/repositories/businessRepository.ts`, depois de `update`:

```ts
  // Campo escolhido por um union fechado, não por chave dinâmica: é o que
  // impede a rota de escrever numa coluna que não seja de imagem.
  setImageKey(id: number, slot: "logo" | "banner", key: string | null) {
    return prisma.business.update({
      where: { id },
      data: slot === "logo" ? { logoKey: key } : { bannerKey: key },
    });
  },
```

Em `server/src/services/businessService.ts`, adicionar o import `import { imageService } from "./imageService";` e, no fim do objeto `businessService`:

```ts
  async updateBusinessImage(
    businessId: number,
    userBusinessId: number | null,
    slot: "logo" | "banner",
    bytes: Buffer,
  ) {
    if (!canEditBusiness(businessId, userBusinessId)) {
      throw new ForbiddenError("You do not have permission to edit this business");
    }

    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    // Grava no storage ANTES do banco: na ordem inversa, uma falha no upload
    // deixaria a linha apontando para um objeto que não existe.
    const key = await imageService.storeImage({ slot, ownerId: businessId, bytes });
    const previousKey = slot === "logo" ? business.logoKey : business.bannerKey;

    const updated = await businessRepository.setImageKey(businessId, slot, key);
    await imageService.discardImage(previousKey);

    return toBusinessImages(updated);
  },

  async removeBusinessImage(
    businessId: number,
    userBusinessId: number | null,
    slot: "logo" | "banner",
  ) {
    if (!canEditBusiness(businessId, userBusinessId)) {
      throw new ForbiddenError("You do not have permission to edit this business");
    }

    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const previousKey = slot === "logo" ? business.logoKey : business.bannerKey;
    const updated = await businessRepository.setImageKey(businessId, slot, null);
    await imageService.discardImage(previousKey);

    return toBusinessImages(updated);
  },
```

E, acima do objeto `businessService`, a função de saída:

```ts
function toBusinessImages(business: Business) {
  return {
    id: business.id,
    logoUrl: imageService.imageUrl(business.logoKey),
    bannerUrl: imageService.imageUrl(business.bannerKey),
  };
}
```

Em `server/src/controllers/businessController.ts`, adicionar:

```ts
import { BadRequestError } from "../lib/errors";
import { MAX_IMAGE_BYTES } from "../services/imageRules";

export interface BusinessImageParams {
  id: number;
}

async function readUploadedImage(request: FastifyRequest): Promise<Buffer> {
  const file = await request.file();
  if (!file) {
    throw new BadRequestError('Envie a imagem no campo "file".');
  }

  // O plugin já corta em MAX_IMAGE_BYTES e o toBuffer lança quando estourou —
  // deixar subir vira 413 no error handler, que é o status certo.
  const bytes = await file.toBuffer();
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new BadRequestError("A imagem precisa ter no máximo 2 MB.");
  }

  return bytes;
}

export async function uploadBusinessLogo(
  request: FastifyRequest<{ Params: BusinessImageParams }>,
  reply: FastifyReply,
): Promise<void> {
  const bytes = await readUploadedImage(request);
  const business = await businessService.updateBusinessImage(
    request.params.id,
    request.user.businessId,
    "logo",
    bytes,
  );

  reply.send({ business });
}

export async function deleteBusinessLogo(
  request: FastifyRequest<{ Params: BusinessImageParams }>,
  reply: FastifyReply,
): Promise<void> {
  const business = await businessService.removeBusinessImage(
    request.params.id,
    request.user.businessId,
    "logo",
  );

  reply.send({ business });
}

export async function uploadBusinessBanner(
  request: FastifyRequest<{ Params: BusinessImageParams }>,
  reply: FastifyReply,
): Promise<void> {
  const bytes = await readUploadedImage(request);
  const business = await businessService.updateBusinessImage(
    request.params.id,
    request.user.businessId,
    "banner",
    bytes,
  );

  reply.send({ business });
}

export async function deleteBusinessBanner(
  request: FastifyRequest<{ Params: BusinessImageParams }>,
  reply: FastifyReply,
): Promise<void> {
  const business = await businessService.removeBusinessImage(
    request.params.id,
    request.user.businessId,
    "banner",
  );

  reply.send({ business });
}
```

Em `server/src/routes/businessRoutes.ts`, importar os quatro handlers e `BusinessImageParams`, declarar o schema de params e registrar:

```ts
const businessImageParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "integer" },
    },
  },
};
```

```ts
  // Sem schema de body: o corpo é multipart, validado por conteúdo no service.
  app.post<{ Params: BusinessImageParams }>(
    "/businesses/:id/logo",
    {
      schema: businessImageParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    uploadBusinessLogo,
  );

  app.delete<{ Params: BusinessImageParams }>(
    "/businesses/:id/logo",
    {
      schema: businessImageParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    deleteBusinessLogo,
  );

  app.post<{ Params: BusinessImageParams }>(
    "/businesses/:id/banner",
    {
      schema: businessImageParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    uploadBusinessBanner,
  );

  app.delete<{ Params: BusinessImageParams }>(
    "/businesses/:id/banner",
    {
      schema: businessImageParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    deleteBusinessBanner,
  );
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd server && node --import tsx --test --test-concurrency=1 src/test/images.integration.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 9: Rodar a suíte inteira**

Run: `cd server && npm run test:all && npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/src server/package.json server/package-lock.json
git commit -m "feat(server): sobe logo e banner do negócio"
```

---

## Task 5: Upload do avatar do colaborador

**Files:**
- Modify: `server/src/services/accountRules.ts`, `server/src/services/accountRules.test.ts`, `server/src/repositories/employeeRepository.ts`, `server/src/services/employeeService.ts`, `server/src/controllers/employeeController.ts`, `server/src/routes/employeeRoutes.ts`, `server/src/test/images.integration.test.ts`

**Interfaces:**
- Consumes: `imageService` (Task 4); `readUploadedImage` — replicado no `employeeController` (os controllers não importam um do outro no repositório; a função tem 8 linhas).
- Produces:
  - `canEditEmployeeAvatar(actor: { id: number; role: Role; businessId: number | null }, target: { id: number; businessId: number | null }): boolean`
  - `employeeRepository.setAvatarKey(id: number, key: string | null)`
  - `employeeService.updateAvatar(actor, employeeId, bytes)` e `removeAvatar(actor, employeeId)` — devolvem `{ id, avatarUrl }`.
  - Rotas `POST|DELETE /employees/:id/avatar`.

- [ ] **Step 1: Escrever o teste da regra de permissão**

Em `server/src/services/accountRules.test.ts`, acrescentar no fim:

```ts
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
```

Ajustar o import do arquivo para incluir `canEditEmployeeAvatar` e `Role` (`import { Role } from "@prisma/client";`) se ainda não estiverem lá.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node --import tsx --test src/services/accountRules.test.ts`
Expected: FAIL — `canEditEmployeeAvatar` não existe.

- [ ] **Step 3: Implementar a regra**

Em `server/src/services/accountRules.ts` (adicionar `import { Role } from "@prisma/client";` se faltar):

```ts
// Duas permissões diferentes no mesmo lugar: o dono cuida da vitrine inteira,
// o colaborador cuida da própria cara. `authorize()` não dá conta porque só
// olha papel, e aqui a identidade do alvo importa.
export function canEditEmployeeAvatar(
  actor: { id: number; role: Role; businessId: number | null },
  target: { id: number; businessId: number | null },
): boolean {
  if (actor.role === Role.ADMIN) {
    return actor.businessId !== null && actor.businessId === target.businessId;
  }

  if (actor.role === Role.EMPLOYEE) {
    return actor.id === target.id;
  }

  return false;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node --import tsx --test src/services/accountRules.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever os testes de integração do avatar**

Acrescentar em `server/src/test/images.integration.test.ts` (as helpers `multipart`, `pngBytes` e `tokenFor` já existem no arquivo desde a Task 4):

```ts
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
```

Se `seedBookableBusiness` não expuser um segundo colaborador, o teste de "EMPLOYEE mexendo em avatar alheio" usa o próprio ADMIN do negócio como alvo:

```ts
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
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd server && node --import tsx --test --test-concurrency=1 src/test/images.integration.test.ts`
Expected: FAIL — 404 em todas as rotas de avatar.

- [ ] **Step 7: Implementar repositório, service, controller e rotas**

Em `server/src/repositories/employeeRepository.ts`:

```ts
  setAvatarKey(id: number, key: string | null) {
    return prisma.user.update({ where: { id }, data: { avatarKey: key } });
  },
```

Em `server/src/services/employeeService.ts`, importar `canEditEmployeeAvatar` de `./accountRules`, `imageService` de `./imageService`, `ForbiddenError` de `../lib/errors`, e adicionar:

```ts
interface AvatarActor {
  id: number;
  role: Role;
  businessId: number | null;
}

// A ordem importa. Fora do seu negócio, o alvo simplesmente "não existe" —
// 403 aqui contaria que aquele id é de alguém. Dentro do negócio, o 403 é
// informação legítima: você sabe que a pessoa existe, só não pode editá-la.
async function findAvatarTarget(actor: AvatarActor, employeeId: number): Promise<User> {
  const target = await employeeRepository.findById(employeeId);
  if (!target || (actor.role === Role.ADMIN && target.businessId !== actor.businessId)) {
    throw new NotFoundError("Employee not found");
  }

  if (!canEditEmployeeAvatar(actor, target)) {
    throw new ForbiddenError("You do not have permission to edit this avatar");
  }

  return target;
}
```

```ts
  async updateAvatar(actor: AvatarActor, employeeId: number, bytes: Buffer) {
    const target = await findAvatarTarget(actor, employeeId);

    const key = await imageService.storeImage({
      slot: "avatar",
      ownerId: target.id,
      bytes,
    });
    const updated = await employeeRepository.setAvatarKey(target.id, key);
    await imageService.discardImage(target.avatarKey);

    return { id: updated.id, avatarUrl: imageService.imageUrl(updated.avatarKey) };
  },

  async removeAvatar(actor: AvatarActor, employeeId: number) {
    const target = await findAvatarTarget(actor, employeeId);

    const updated = await employeeRepository.setAvatarKey(target.id, null);
    await imageService.discardImage(target.avatarKey);

    return { id: updated.id, avatarUrl: null };
  },
```

Em `server/src/controllers/employeeController.ts`:

```ts
import { BadRequestError } from "../lib/errors";
import { MAX_IMAGE_BYTES } from "../services/imageRules";

async function readUploadedImage(request: FastifyRequest): Promise<Buffer> {
  const file = await request.file();
  if (!file) {
    throw new BadRequestError('Envie a imagem no campo "file".');
  }

  const bytes = await file.toBuffer();
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new BadRequestError("A imagem precisa ter no máximo 2 MB.");
  }

  return bytes;
}

export async function uploadEmployeeAvatar(
  request: FastifyRequest<{ Params: EmployeeParams }>,
  reply: FastifyReply,
): Promise<void> {
  const bytes = await readUploadedImage(request);
  const employee = await employeeService.updateAvatar(
    { id: request.user.sub, role: request.user.role, businessId: request.user.businessId },
    request.params.id,
    bytes,
  );

  reply.send({ employee });
}

export async function deleteEmployeeAvatar(
  request: FastifyRequest<{ Params: EmployeeParams }>,
  reply: FastifyReply,
): Promise<void> {
  const employee = await employeeService.removeAvatar(
    { id: request.user.sub, role: request.user.role, businessId: request.user.businessId },
    request.params.id,
  );

  reply.send({ employee });
}
```

Em `server/src/routes/employeeRoutes.ts`:

```ts
  // Sem requireActiveSubscription: trocar a própria foto não movimenta a
  // agenda nem cria dado novo — bloquear isso por assinatura só irrita.
  app.post<{ Params: EmployeeParams }>(
    "/employees/:id/avatar",
    {
      schema: employeeParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN, Role.EMPLOYEE)],
    },
    uploadEmployeeAvatar,
  );

  app.delete<{ Params: EmployeeParams }>(
    "/employees/:id/avatar",
    {
      schema: employeeParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN, Role.EMPLOYEE)],
    },
    deleteEmployeeAvatar,
  );
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd server && npm run test:all && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src
git commit -m "feat(server): sobe avatar do colaborador"
```

---

## Task 6: Expor as URLs nas respostas existentes

**Files:**
- Modify: `server/src/repositories/userRepository.ts`, `server/src/repositories/employeeRepository.ts`, `server/src/repositories/businessRepository.ts`, `server/src/repositories/dashboardRepository.ts`, `server/src/services/authService.ts`, `server/src/services/employeeService.ts`, `server/src/services/publicBookingRules.ts`, `server/src/services/publicBookingRules.test.ts`, `server/src/services/publicBookingService.ts`, `server/src/services/dashboardRules.ts`, `server/src/services/dashboardRules.test.ts`, `server/src/services/dashboardService.ts`

**Interfaces:**
- Consumes: `imageService.imageUrl` (Task 4).
- Produces:
  - `GET /auth/me` → `user.avatarUrl: string | null` e `user.business.logoUrl` / `bannerUrl`.
  - `GET /employees` → cada item ganha `avatarUrl: string | null`.
  - `GET /public/businesses/:slug` → `business.logoUrl` / `bannerUrl` e cada `PublicEmployeeDto` ganha `avatarUrl`.
  - `GET /dashboard/overview` → cada `TeamRow` ganha `avatarUrl`.

- [ ] **Step 1: Perfil e negócio do usuário logado**

Em `userRepository.findByIdWithBusiness`, adicionar `avatarKey: true` no `select` do usuário e `logoKey: true, bannerKey: true` no `select` de `business`.

Em `authService.getProfile`, trocar o `return user;` por:

```ts
    // A key nunca sai para o cliente: o front recebe URL pronta e não sabe
    // nada sobre o bucket.
    const { avatarKey, business, ...rest } = user;

    return {
      ...rest,
      avatarUrl: imageService.imageUrl(avatarKey),
      business: business
        ? {
            id: business.id,
            name: business.name,
            slug: business.slug,
            address: business.address,
            planName: business.planName,
            subscriptionStatus: business.subscriptionStatus,
            logoUrl: imageService.imageUrl(business.logoKey),
            bannerUrl: imageService.imageUrl(business.bannerKey),
          }
        : null,
    };
```

`accountService.updateProfile` devolve o retorno de `userRepository.findByIdWithBusiness` diretamente — trocar essa chamada por `authService.getProfile(userId)` para os dois endpoints devolverem exatamente o mesmo shape. Se isso criar import circular entre `accountService` e `authService`, extrair a montagem para uma função exportada `toProfileDto(user)` em `authService.ts` e importar só ela.

- [ ] **Step 2: Lista de colaboradores**

Em `employeeRepository.findManyByBusiness`, adicionar `avatarKey: true` ao `select`.

Em `employeeService.listEmployees`, adicionar ao objeto mapeado:

```ts
      avatarUrl: imageService.imageUrl(employee.avatarKey),
```

- [ ] **Step 3: Catálogo público**

Em `businessRepository.findBySlugWithCatalog`, incluir `logoKey` e `bannerKey` do negócio (o `findUnique` sem `select` já traz tudo do `Business`; confirmar) e trocar
`employee: { select: { id: true, name: true } }` por
`employee: { select: { id: true, name: true, avatarKey: true } }`.

Em `publicBookingRules.ts`:
- `PublicEmployeeDto` ganha `avatarUrl: string | null`.
- A assinatura de `toPublicBusinessDto` passa a receber `business: { name: string; slug: string; address?: string | null; logoUrl: string | null; bannerUrl: string | null }` e cada employee de `CatalogService` ganha `avatarUrl: string | null`.
- `withNextSlot` devolve `{ id, name, avatarUrl: employee.avatarUrl, nextSlot }`.
- O objeto `business` do retorno ganha `logoUrl: business.logoUrl` e `bannerUrl: business.bannerUrl`.

Em `publicBookingService.getBusinessPage`, montar as URLs antes de chamar a regra pura:

```ts
    return toPublicBusinessDto(
      {
        name: business.name,
        slug: business.slug,
        address: business.address,
        logoUrl: imageService.imageUrl(business.logoKey),
        bannerUrl: imageService.imageUrl(business.bannerKey),
      },
      business.services.map((service) => ({
        id: service.id,
        name: service.name,
        duration: service.duration,
        price: service.price,
        employees: service.employees.map((link) => ({
          id: link.employee.id,
          name: link.employee.name,
          avatarUrl: imageService.imageUrl(link.employee.avatarKey),
        })),
      })),
      freeSlots,
      now,
    );
```

- [ ] **Step 4: Atualizar o teste da regra pública**

Em `publicBookingRules.test.ts`, acrescentar `logoUrl` e `bannerUrl` ao objeto de negócio e `avatarUrl` aos employees das fixtures, e um teste novo:

```ts
test("toPublicBusinessDto repassa as imagens do negócio e dos profissionais", () => {
  const dto = toPublicBusinessDto(
    {
      name: "Barbearia Alfa",
      slug: "alfa",
      address: null,
      logoUrl: "https://cdn.exemplo.com/businesses/1/logo-a.webp",
      bannerUrl: null,
    },
    [
      {
        id: 1,
        name: "Corte",
        duration: 30,
        price: "40.00",
        employees: [
          { id: 9, name: "Zé", avatarUrl: "https://cdn.exemplo.com/employees/9/avatar-b.webp" },
        ],
      },
    ],
    [],
    new Date("2026-07-29T12:00:00.000Z"),
  );

  assert.equal(dto.business.logoUrl, "https://cdn.exemplo.com/businesses/1/logo-a.webp");
  assert.equal(dto.business.bannerUrl, null);
  assert.equal(
    dto.professionals[0].avatarUrl,
    "https://cdn.exemplo.com/employees/9/avatar-b.webp",
  );
});
```

- [ ] **Step 5: Equipe do dashboard**

Em `dashboardRepository`, na query que lista os colaboradores do negócio (a que alimenta `EmployeeRow`), adicionar `avatarKey: true` ao `select`.

Em `dashboardRules.ts`: `EmployeeRow` e `TeamRow` ganham `avatarUrl: string | null`, e `rankTeam` repassa `avatarUrl: employee.avatarUrl` no objeto de retorno.

Em `dashboardService`, ao montar `EmployeeRow[]`, mapear `avatarUrl: imageService.imageUrl(employee.avatarKey)`.

Em `dashboardRules.test.ts`, acrescentar `avatarUrl: null` às fixtures de employee e um `assert.equal(rows[0].avatarUrl, "https://cdn/x.webp")` num caso que passe o valor preenchido.

> **Atenção:** `dashboardRules.ts`, `dashboardRules.test.ts` e `dashboardService.ts` já têm alterações não commitadas no working tree. Rode `git diff` nesses arquivos antes de editar e não desfaça nada que já esteja lá.

- [ ] **Step 6: Rodar tudo**

Run: `cd server && npm run test:all && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src
git commit -m "feat(server): devolve as URLs das imagens nas respostas existentes"
```

---

## Task 7: Base do front — cálculo puro e upload

**Files:**
- Create: `web/lib/image.ts`, `web/lib/image.test.ts`, `web/lib/imageFile.ts`
- Modify: `web/adapters/fetchAdapter.ts`

**Interfaces:**
- Consumes: `API_URL`, `ApiError`, `getToken` de `web/adapters/fetchAdapter.ts` e `web/lib/auth.ts`.
- Produces:
  - `type ImagePreset = { width: number; height: number }`
  - `const IMAGE_PRESETS: { logo: ImagePreset; avatar: ImagePreset; banner: ImagePreset }`
  - `function coverCrop(source: { width: number; height: number }, target: ImagePreset): { sx: number; sy: number; sWidth: number; sHeight: number }`
  - `function resizeToWebp(file: File, preset: ImagePreset): Promise<Blob>` (browser)
  - `uploadAdapter({ method, path, file }): Promise<T>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `web/lib/image.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { IMAGE_PRESETS, coverCrop } from "./image";

// Origem mais larga que o destino: corta nas laterais, mantém a altura toda.
test("coverCrop corta as laterais de uma imagem panorâmica", () => {
  const crop = coverCrop({ width: 2000, height: 1000 }, { width: 400, height: 400 });

  assert.deepEqual(crop, { sx: 500, sy: 0, sWidth: 1000, sHeight: 1000 });
});

// Origem mais alta: corta em cima e embaixo, mantém a largura toda.
test("coverCrop corta o topo e o pé de uma imagem vertical", () => {
  const crop = coverCrop({ width: 1000, height: 2000 }, { width: 400, height: 400 });

  assert.deepEqual(crop, { sx: 0, sy: 500, sWidth: 1000, sHeight: 1000 });
});

test("coverCrop não corta nada quando a proporção já bate", () => {
  const crop = coverCrop({ width: 1600, height: 600 }, IMAGE_PRESETS.banner);

  assert.deepEqual(crop, { sx: 0, sy: 0, sWidth: 1600, sHeight: 600 });
});

test("os presets são os combinados na spec", () => {
  assert.deepEqual(IMAGE_PRESETS, {
    logo: { width: 512, height: 512 },
    avatar: { width: 400, height: 400 },
    banner: { width: 1600, height: 600 },
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && node --test lib/image.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o cálculo puro**

Criar `web/lib/image.ts`:

```ts
export interface ImagePreset {
  width: number;
  height: number;
}

export const IMAGE_PRESETS = {
  logo: { width: 512, height: 512 },
  avatar: { width: 400, height: 400 },
  banner: { width: 1600, height: 600 },
} as const satisfies Record<string, ImagePreset>;

export interface CropBox {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

// "cover": preenche o destino inteiro e descarta a sobra, centralizada. O
// contrário ("contain") deixaria tarja no card, que é pior do que perder um
// pedaço da borda numa foto de perfil.
export function coverCrop(
  source: { width: number; height: number },
  target: ImagePreset,
): CropBox {
  const sourceRatio = source.width / source.height;
  const targetRatio = target.width / target.height;

  if (sourceRatio > targetRatio) {
    const sWidth = Math.round(source.height * targetRatio);
    return {
      sx: Math.round((source.width - sWidth) / 2),
      sy: 0,
      sWidth,
      sHeight: source.height,
    };
  }

  const sHeight = Math.round(source.width / targetRatio);
  return {
    sx: 0,
    sy: Math.round((source.height - sHeight) / 2),
    sWidth: source.width,
    sHeight,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && node --test lib/image.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Implementar a conversão no browser**

Criar `web/lib/imageFile.ts`:

```ts
import { ImagePreset, coverCrop } from "./image";

// Sem teste em Node: canvas e createImageBitmap só existem no browser. A
// parte que tem regra — o recorte — mora em image.ts, que é testada.
export async function resizeToWebp(file: File, preset: ImagePreset): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = preset.width;
    canvas.height = preset.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Não foi possível processar a imagem neste navegador.");
    }

    const { sx, sy, sWidth, sHeight } = coverCrop(
      { width: bitmap.width, height: bitmap.height },
      preset,
    );
    context.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, preset.width, preset.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob) {
      throw new Error("Não foi possível processar a imagem neste navegador.");
    }

    return blob;
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 6: Adicionar o upload ao adapter**

Em `web/adapters/fetchAdapter.ts`, no fim do arquivo:

```ts
interface UploadAdapterInput {
  path: string;
  file: Blob;
  filename?: string;
}

// Separado do fetchAdapter porque o corpo é FormData: declarar Content-Type à
// mão aqui quebraria o boundary que o browser gera sozinho.
export const uploadAdapter = async <T = unknown>({
  path,
  file,
  filename = "imagem.webp",
}: UploadAdapterInput): Promise<T> => {
  const token = typeof window === "undefined" ? null : getToken();

  const form = new FormData();
  form.append("file", file, filename);

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as T;

  if (!res.ok) {
    const message =
      (data as { message?: string }).message ?? "Erro inesperado. Tente novamente.";
    throw new ApiError(message, res.status);
  }

  return data;
};
```

- [ ] **Step 7: Rodar testes e typecheck**

Run: `cd web && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/lib/image.ts web/lib/image.test.ts web/lib/imageFile.ts web/adapters/fetchAdapter.ts
git commit -m "feat(web): redimensiona imagem no cliente e envia por multipart"
```

---

## Task 8: Campo de upload e as imagens do negócio

**Files:**
- Create: `web/components/image-upload-field.tsx`
- Modify: `web/lib/auth.ts`, `web/app/dashboard/settings/business-card.tsx`

**Interfaces:**
- Consumes: `resizeToWebp`, `IMAGE_PRESETS` (Task 7); `uploadAdapter`, `fetchAdapter`, `ApiError`; `AuthUser` de `web/lib/auth.ts`; `useRefreshAuthUser` de `web/app/dashboard/auth-context.tsx`.
- Produces: componente

```tsx
interface ImageUploadFieldProps {
  label: string;
  description: string;
  preset: ImagePreset;
  currentUrl: string | null;
  uploadPath: string;
  onDone: (url: string | null) => void | Promise<void>;
  shape?: "square" | "wide";
}
```

- [ ] **Step 1: Ampliar o tipo de usuário do front**

Em `web/lib/auth.ts`, adicionar `avatarUrl: string | null;` a `AuthUser` e `logoUrl: string | null; bannerUrl: string | null;` ao objeto `business`.

- [ ] **Step 2: Implementar o componente**

Criar `web/components/image-upload-field.tsx`:

```tsx
"use client";

import { ChangeEvent, useRef, useState } from "react";
import { ApiError, fetchAdapter, uploadAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ImagePreset } from "@/lib/image";
import { resizeToWebp } from "@/lib/imageFile";
import { cn } from "@/lib/utils";

interface ImageUploadFieldProps {
  label: string;
  description: string;
  preset: ImagePreset;
  currentUrl: string | null;
  /** Caminho na API. POST envia, DELETE remove. */
  uploadPath: string;
  onDone: (url: string | null) => void | Promise<void>;
  shape?: "square" | "wide";
}

function translateError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Erro inesperado.";
  }

  if (error.status === 400) return "Envie uma imagem JPG, PNG ou WebP de até 2 MB.";
  if (error.status === 413) return "A imagem é grande demais. Escolha uma menor.";
  if (error.status === 403) return "Você não tem permissão para trocar esta imagem.";

  return error.message;
}

export function ImageUploadField({
  label,
  description,
  preset,
  currentUrl,
  uploadPath,
  onDone,
  shape = "square",
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Limpa aqui e não no fim: sem isto, escolher o mesmo arquivo de novo
    // depois de um erro não dispara change nenhum.
    event.target.value = "";
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      const blob = await resizeToWebp(file, preset);
      const data = await uploadAdapter<{
        business?: { logoUrl: string | null; bannerUrl: string | null };
        employee?: { avatarUrl: string | null };
      }>({ path: uploadPath, file: blob });

      await onDone(extractUrl(data, uploadPath));
    } catch (err) {
      setError(translateError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      await fetchAdapter({ method: "DELETE", path: uploadPath });
      await onDone(null);
    } catch (err) {
      setError(translateError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>

      <div className="flex items-center gap-4">
        {currentUrl ? (
          // URL de bucket externo, sem domínio conhecido de antemão para
          // configurar em next/image — mesma razão do BusinessMark.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt=""
            className={cn(
              "rounded-2xl border object-cover",
              shape === "wide" ? "h-20 w-48" : "size-20",
            )}
          />
        ) : (
          <div
            aria-hidden
            className={cn(
              "rounded-2xl border border-dashed bg-muted/40",
              shape === "wide" ? "h-20 w-48" : "size-20",
            )}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {currentUrl ? "Trocar" : "Enviar imagem"}
          </Button>

          {currentUrl ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={handleRemove}>
              Remover
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />

      <FieldDescription>{description}</FieldDescription>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

function extractUrl(
  data: {
    business?: { logoUrl: string | null; bannerUrl: string | null };
    employee?: { avatarUrl: string | null };
  },
  uploadPath: string,
): string | null {
  if (data.employee) return data.employee.avatarUrl;
  if (!data.business) return null;

  return uploadPath.endsWith("/banner") ? data.business.bannerUrl : data.business.logoUrl;
}
```

- [ ] **Step 3: Ligar no cartão do negócio**

Em `web/app/dashboard/settings/business-card.tsx`:
- Estender a prop `business` com `logoUrl: string | null; bannerUrl: string | null`.
- Guardar `const [logoUrl, setLogoUrl] = useState(business.logoUrl);` e o equivalente para o banner.
- Acima do primeiro `<Field>` do formulário (fora do `<form>`, porque o upload não passa pelo submit), inserir:

```tsx
      <div className="mt-6 space-y-6">
        <ImageUploadField
          label="Logo"
          description="Quadrada, aparece na sua página pública e no painel. JPG, PNG ou WebP de até 2 MB."
          preset={IMAGE_PRESETS.logo}
          currentUrl={logoUrl}
          uploadPath={`/businesses/${business.id}/logo`}
          onDone={async (url) => {
            setLogoUrl(url);
            await refresh();
          }}
        />

        <ImageUploadField
          label="Banner"
          description="Imagem larga do topo da sua página pública. JPG, PNG ou WebP de até 2 MB."
          preset={IMAGE_PRESETS.banner}
          shape="wide"
          currentUrl={bannerUrl}
          uploadPath={`/businesses/${business.id}/banner`}
          onDone={async (url) => {
            setBannerUrl(url);
            await refresh();
          }}
        />
      </div>
```

- Ajustar `web/app/dashboard/settings/page.tsx` para passar `logoUrl` e `bannerUrl` (vêm de `user.business`, já ampliado no Step 1).

- [ ] **Step 4: Verificar no navegador**

Run: `cd server && npm run dev` e, noutro terminal, `cd web && npm run dev`
Fazer: entrar como ADMIN, ir em Configurações, enviar uma logo e um banner, recarregar a página.
Expected: a imagem aparece no preview e continua lá depois do reload; o arquivo existe em `server/uploads/businesses/<id>/`.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `cd web && npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/components/image-upload-field.tsx web/lib/auth.ts web/app/dashboard/settings
git commit -m "feat(web): permite enviar logo e banner do negócio"
```

---

## Task 9: Avatar no painel

**Files:**
- Modify: `web/lib/types.ts`, `web/app/dashboard/settings/profile-card.tsx`, `web/app/dashboard/team/employee-card.tsx`, `web/app/dashboard/team/page.tsx`, `web/components/dashboard/team-table.tsx`, `web/lib/dashboard.ts`, `web/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `ImageUploadField` (Task 8); `TeamAvatar`, `BusinessMark`; `Employee` de `web/lib/types.ts`; `TeamRow` de `web/lib/dashboard.ts`.
- Produces: nada novo — só consumo das URLs.

- [ ] **Step 1: Ampliar os tipos do front**

Em `web/lib/types.ts`, `Employee` ganha `avatarUrl: string | null;`.
Em `web/lib/dashboard.ts`, a interface das linhas de equipe (`TeamRow`) ganha `avatarUrl: string | null;`.

- [ ] **Step 2: Avatar no próprio perfil**

Em `profile-card.tsx`, adicionar antes do `<FieldGroup>`:

```tsx
          <ImageUploadField
            label="Sua foto"
            description="Aparece para os clientes na hora de escolher com quem agendar."
            preset={IMAGE_PRESETS.avatar}
            currentUrl={avatarUrl}
            uploadPath={`/employees/${user.id}/avatar`}
            onDone={async (url) => {
              setAvatarUrl(url);
              await refresh();
            }}
          />
```

com `const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);` junto dos outros estados.

- [ ] **Step 3: Avatar na gestão de equipe**

Em `employee-card.tsx`, trocar

```tsx
          <TeamAvatar name={employee.name} className="size-11 rounded-2xl" />
```

por

```tsx
          <TeamAvatar
            name={employee.name}
            src={employee.avatarUrl}
            className="size-11 rounded-2xl"
          />
```

e adicionar, no corpo do card (onde ficam as ações do colaborador), um `ImageUploadField` com `preset={IMAGE_PRESETS.avatar}`, `uploadPath={`/employees/${employee.id}/avatar`}`, `currentUrl={employee.avatarUrl}` e `onDone` chamando o mesmo callback de recarregar a lista que o card já usa depois de vincular/desvincular serviço (conferir o nome exato da prop em `web/app/dashboard/team/page.tsx` e reusá-la).

Em `web/components/dashboard/team-table.tsx`, trocar

```tsx
      <TeamAvatar name={row.name} className="size-9 rounded-xl text-xs" />
```

por

```tsx
      <TeamAvatar name={row.name} src={row.avatarUrl} className="size-9 rounded-xl text-xs" />
```

- [ ] **Step 4: Logo no header do painel**

Em `web/app/dashboard/layout.tsx`, onde hoje aparece o nome do negócio no header, colocar a marca ao lado:

```tsx
<BusinessMark
  name={user.business.name}
  slug={user.business.slug}
  src={user.business.logoUrl}
  className="size-9 rounded-xl"
/>
```

(usar o `user` que o layout já tem do contexto de autenticação; se o header for renderizado num componente filho, passar a prop até lá).

- [ ] **Step 5: Verificar no navegador**

Fazer: entrar como EMPLOYEE, trocar a própria foto em Configurações; entrar como ADMIN e trocar a foto de um colaborador na tela de Equipe; conferir o avatar na tabela do dashboard e a logo no header.
Expected: as três telas mostram a imagem sem recarregar à mão.

- [ ] **Step 6: Rodar testes e typecheck**

Run: `cd web && npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): mostra avatar do colaborador e logo no painel"
```

---

## Task 10: Imagens na vitrine pública

**Files:**
- Modify: `web/lib/publicBooking.ts`, `web/app/[slug]/showcase-hero.tsx`, `web/app/[slug]/team-section.tsx`, `web/app/[slug]/employee-picker.tsx`, `web/components/business-mark.tsx`, `web/components/team-avatar.tsx`

**Interfaces:**
- Consumes: `PublicBusiness` (ampliado aqui), `BusinessMark`, `TeamAvatar`.
- Produces: `PublicEmployee.avatarUrl: string | null`; `PublicBusiness["business"]` ganha `logoUrl` e `bannerUrl`.

- [ ] **Step 1: Ampliar os tipos públicos**

Em `web/lib/publicBooking.ts`:

```ts
export interface PublicEmployee {
  id: number;
  name: string;
  avatarUrl: string | null;
  nextSlot: NextSlot | null;
}
```

```ts
export interface PublicBusiness {
  business: {
    name: string;
    slug: string;
    address: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
  };
  professionals: PublicEmployee[];
  services: PublicService[];
}
```

- [ ] **Step 2: Banner e logo no hero**

Em `showcase-hero.tsx`, trocar a faixa decorativa por: banner quando existir, listra diagonal quando não. O `div` decorativo atual vira o `else`:

```tsx
      {catalog.business.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={catalog.business.bannerUrl}
          alt=""
          className="h-36 w-full object-cover sm:h-48 lg:h-60"
        />
      ) : (
        <div
          aria-hidden
          style={{
            backgroundImage: `repeating-linear-gradient(115deg, rgba(255,255,255,0.07) 0 26px, transparent 26px 52px), linear-gradient(135deg, ${from}, ${to})`,
          }}
          className="h-36 w-full sm:h-48 lg:h-60"
        />
      )}
```

E passar a logo para a marca:

```tsx
        <BusinessMark
          name={catalog.business.name}
          slug={slug}
          src={catalog.business.logoUrl}
          className="-mt-10 size-20 sm:-mt-12 sm:size-24"
        />
```

- [ ] **Step 3: Avatar na equipe e na escolha do profissional**

Em `team-section.tsx`:

```tsx
              <TeamAvatar name={professional.name} src={professional.avatarUrl} />
```

Em `employee-picker.tsx`, localizar onde o nome do profissional é renderizado no card de escolha e colocar o `TeamAvatar` com `src={employee.avatarUrl}` (se o picker hoje não usa avatar nenhum, adicionar um `size-10 rounded-xl` à esquerda do nome — a foto é justamente o ponto desta feature nessa tela).

- [ ] **Step 4: Tirar os comentários de "Fase 2"**

Em `web/components/business-mark.tsx` e `web/components/team-avatar.tsx`, trocar o comentário `/** Reservado para a Fase 2... */` por `/** URL pública da imagem; sem ela, cai nas iniciais. */`.

- [ ] **Step 5: Verificar no navegador**

Fazer: abrir `/{slug}` sem estar logado, com logo, banner e ao menos um avatar cadastrados; depois abrir um negócio sem imagem nenhuma.
Expected: o primeiro mostra as fotos; o segundo continua idêntico ao que era antes, com listra e iniciais.

- [ ] **Step 6: Rodar testes, typecheck e build**

Run: `cd web && npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): mostra logo, banner e avatares na vitrine pública"
```

---

## Task 11: Documentação e configuração de produção

**Files:**
- Modify: `README.md`, `docs/deploy-netlify.md`

**Interfaces:**
- Consumes: tudo que veio antes.
- Produces: instruções de bucket e variáveis para o deploy.

- [ ] **Step 1: Atualizar o README**

Em `README.md`:
- Na seção **API**, acrescentar as seis rotas novas na lista de endpoints.
- Em **Decisões de modelagem**, um parágrafo novo:

```markdown
**A imagem mora fora do banco, e o banco só guarda a key.** Logo, banner e
avatar vão para um bucket (Cloudflare R2 em produção, disco local em
desenvolvimento) e o Postgres guarda só `businesses/12/logo-9f3a.webp`. A URL
pública é montada na camada de service a partir de uma variável de ambiente:
trocar de bucket ou de domínio não exige tocar em uma linha sequer do banco. O
sufixo aleatório na key impede adivinhar a imagem de outro negócio e garante
que a troca de foto não seja servida do cache com a versão antiga.
```

- Em **Estado atual**, mover "imagens" de "a caminho" para "funcionando", se estiver listado.

- [ ] **Step 2: Documentar o bucket no guia de deploy**

Em `docs/deploy-netlify.md`, uma seção nova antes de "Conferir depois do primeiro deploy":

```markdown
## Armazenamento de imagens (Cloudflare R2)

As fotos não podem ficar no disco do container: o Railway o recria a cada
deploy e as imagens sumiriam sem nenhum erro no log.

1. Cloudflare → R2 → **Create bucket**. Nome: `timeflow`.
2. No bucket → **Settings** → **Public access** → habilitar o domínio
   `r2.dev` (ou ligar um domínio próprio, se houver). A URL que aparece é o
   valor de `R2_PUBLIC_URL`.
3. R2 → **Manage API tokens** → **Create API token**, permissão *Object Read &
   Write*, escopo só neste bucket. Ele mostra `Access Key ID` e
   `Secret Access Key` uma única vez.
4. Railway → variáveis do serviço da API:

| Variável | Valor |
| --- | --- |
| `R2_ACCOUNT_ID` | ID da conta Cloudflare (aparece na URL do painel do R2) |
| `R2_ACCESS_KEY_ID` | do token criado no passo 3 |
| `R2_SECRET_ACCESS_KEY` | do token criado no passo 3 |
| `R2_BUCKET` | `timeflow` |
| `R2_PUBLIC_URL` | URL pública do passo 2, sem barra no fim |

É tudo ou nada: com algumas dessas variáveis e não todas, a API recusa subir
com a mensagem dizendo quais faltam. Sem nenhuma, ela grava em disco — o que
só serve para desenvolvimento.
```

- [ ] **Step 3: Teste manual contra o R2 de verdade**

Fazer: com as cinco variáveis preenchidas num `.env` local, subir a API, enviar uma logo pelo painel e abrir a URL devolvida numa aba anônima.
Expected: a imagem carrega; o objeto aparece no bucket; trocar a logo cria um objeto novo e apaga o anterior.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/deploy-netlify.md
git commit -m "docs: documenta o armazenamento de imagens no R2"
```

---

## Self-Review

**Cobertura da spec**

| Requisito da spec | Task |
| --- | --- |
| `logoKey`, `bannerKey`, `avatarKey` nullable | 1 |
| Guardar key, não URL; URL montada no service | 1, 4, 6 |
| Interface `ObjectStorage` com R2 e disco | 3 |
| Seleção por presença de credencial, como o mailer | 3 |
| Cinco variáveis do R2, tudo ou nada | 3, 11 |
| Seis rotas por recurso | 4, 5 |
| Multipart com limite de 2 MB | 4 |
| Validação por magic bytes | 2 |
| Limite de tamanho na regra pura | 2 |
| Key com sufixo aleatório | 2 |
| Apagar o objeto anterior em best-effort | 4, 5 |
| ADMIN ou o próprio EMPLOYEE no avatar | 5 |
| Redimensionamento no cliente, presets | 7 |
| `ImageUploadField` nos seis lugares | 8, 9, 10 |
| Fallback de iniciais preservado | 9, 10 |
| Testes: imageRules, image, integração | 2, 7, 4, 5 |
| Tabela de erros | 4, 5 (com o desvio do 404 registrado nos Global Constraints) |

**Desvio consciente da spec:** a spec previa 403 para "alvo de outro negócio". O plano usa 404 nesse caso, por consistência com `findOwnedEmployee` e com `isolation.integration.test.ts`, que é o padrão do repositório contra vazamento de existência. O 403 fica para o caso "mesmo negócio, EMPLOYEE mexendo em avatar alheio".

**Consistência de tipos:** `ImageKind`/`ImageSlot`/`MAX_IMAGE_BYTES` (Task 2) são consumidos com esses nomes nas Tasks 3–5; `ObjectStorage`/`getStorage`/`CONTENT_TYPES` (Task 3) nas Tasks 4–6; `imageService.imageUrl` (Task 4) na Task 6; `IMAGE_PRESETS`/`coverCrop`/`resizeToWebp`/`uploadAdapter` (Task 7) nas Tasks 8–9; `avatarUrl`/`logoUrl`/`bannerUrl` aparecem com o mesmo nome no servidor (Task 6) e no front (Tasks 8–10).
