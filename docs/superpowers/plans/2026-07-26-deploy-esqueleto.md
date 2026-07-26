# Fase 1 — Deploy Esqueleto: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar a API e o front-end do Time Flow no ar, em domínio próprio, com o banco Postgres gerenciado e as migrations aplicadas — ainda com o produto incompleto, para que os problemas de infraestrutura apareçam enquanto são baratos.

**Architecture:** As tarefas 1–6 consertam o que impede a aplicação de rodar fora da máquina do desenvolvedor: o build de produção (que hoje não executa), o bind de rede, o CORS de origem única, a versão do Node, os scripts de release e o seed com senha padrão. Cada uma é verificável localmente. As tarefas 7–11 provisionam a infraestrutura na ordem de dependência — banco, API, web, domínio — e terminam com um teste de fumaça que percorre o produto inteiro em produção.

**Tech Stack:** Node.js, TypeScript, Fastify 5, Prisma 6, PostgreSQL 16, Next.js 16, Railway (API + Postgres), Vercel (web).

## Global Constraints

- Todo comentário e mensagem de commit em português; código, identificadores e nomes de arquivo em inglês. É o padrão vigente no repositório.
- Mensagens de commit seguem `tipo(escopo): descrição no imperativo em inglês`, como o histórico existente (`feat(server):`, `fix(web):`, `chore:`, `docs:`).
- Todo JSON Schema novo declara `additionalProperties: false`.
- Nenhum segredo entra no repositório. Valores reais só em variável de ambiente do provedor; `.env.example` recebe apenas placeholders.
- Os testes não podem depender de banco de dados. Toda lógica nova nasce como função pura testável; o que toca Prisma fica em `repositories/` e não é coberto por teste unitário.
- `prisma migrate dev` nunca roda contra produção — apenas `prisma migrate deploy`.
- Rode `npm test` e `npm run typecheck` em `server/` antes de cada commit de tarefa.

---

## Estrutura de Arquivos

**Criados:**
- `server/tsconfig.build.json` — configuração de build que exclui os testes do `dist/`, mantendo o `tsconfig.json` cobrindo tudo no typecheck.
- `server/src/app.ts` — monta a instância Fastify (plugins, rotas, error handler) e a devolve. Sem efeito colateral de processo, o que torna a aplicação testável via `app.inject()`.
- `server/src/config/origins.ts` — parsing puro da lista de origens do CORS.
- `server/src/config/origins.test.ts` — testes do parsing.
- `server/src/services/healthRules.ts` — monta o relatório de saúde a partir de um booleano. Puro.
- `server/src/services/healthRules.test.ts` — testes do relatório.
- `server/src/repositories/healthRepository.ts` — ping no Postgres.
- `server/src/routes/healthRoutes.ts` — `GET /health`.
- `server/prisma/seedCredentials.ts` — resolve e valida as credenciais do seed conforme o ambiente. Puro.
- `server/prisma/seedCredentials.test.ts` — testes da validação.
- `server/.nvmrc` — versão do Node fixada.

**Modificados:**
- `server/tsconfig.json:4-5` — `module` e `moduleResolution` para CommonJS.
- `server/src/server.ts` — vira o bootstrap do processo: importa `buildApp`, escuta em `0.0.0.0`, trata falha de bind.
- `server/src/config/env.ts` — ganha `host`, `nodeEnv` e troca `webOrigin` por `webOrigins`.
- `server/src/config/cors.ts:7` — passa a receber lista de origens.
- `server/src/config/cors.test.ts:22` — acompanha a mudança para lista.
- `server/package.json` — `engines`, `postinstall`, `db:deploy`, `build` apontando para o tsconfig de build.
- `server/prisma/seed.ts` — usa `seedCredentials`.
- `server/.env.example` — documenta `HOST`, `NODE_ENV` e o formato de lista de `WEB_ORIGIN`.
- `web/.env.example` — comenta o valor de produção.
- `README.md` — seção de deploy.

---

### Task 1: Build de produção que executa

Hoje `npm run build` gera `dist/`, mas `node dist/server.js` falha com `ERR_MODULE_NOT_FOUND`: o `tsconfig` emite ESM (`module: ESNext`) com imports relativos sem extensão, e o resolver ESM do Node exige a extensão. A aplicação só jamais rodou via `tsx`. Sem isto, qualquer deploy morre no start.

Emitir CommonJS resolve sem tocar em nenhum import. Nada da stack (Fastify 5, Prisma, nodemailer, bcrypt) exige ESM.

**Files:**
- Modify: `server/tsconfig.json:4-5`
- Create: `server/tsconfig.build.json`
- Modify: `server/package.json` (script `build`)

**Interfaces:**
- Consumes: nada.
- Produces: `npm run build` gera um `dist/` sem arquivos de teste, e `node dist/server.js` sobe o processo. Todas as tarefas seguintes dependem disso.

- [ ] **Step 1: Confirmar a falha atual**

```bash
cd server
npm run build && node dist/server.js
```

Esperado: FALHA com `ERR_MODULE_NOT_FOUND` mencionando `/dist/config/cors`, precedida do aviso `MODULE_TYPELESS_PACKAGE_JSON`. Se isto passar, pare: a premissa da tarefa mudou.

- [ ] **Step 2: Trocar o alvo de módulo para CommonJS**

Em `server/tsconfig.json`, substitua as linhas 4 e 5:

```json
    "module": "CommonJS",
    "moduleResolution": "Node",
```

O resto de `compilerOptions` fica intacto.

- [ ] **Step 3: Criar o tsconfig de build**

Os testes vivem em `src/**/*.test.ts` e hoje seriam compilados para dentro do `dist/`. O `tsconfig.json` continua incluindo tudo — é ele que o `typecheck` usa, e os testes precisam ser verificados. O build usa um arquivo separado:

`server/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

- [ ] **Step 4: Apontar o script de build para ele**

Em `server/package.json`, no bloco `scripts`:

```json
    "build": "tsc --project tsconfig.build.json",
```

- [ ] **Step 5: Verificar que o build roda e não leva testes junto**

```bash
cd server
rm -rf dist
npm run build
ls dist/config/           # deve conter cors.js e env.js, e NENHUM cors.test.js
find dist -name "*.test.js" | wc -l   # deve imprimir 0
```

- [ ] **Step 6: Verificar que o processo sobe a partir do dist**

Com o Postgres local no ar (`docker compose up -d`):

```bash
cd server
node dist/server.js &
sleep 2
curl -s http://localhost:3333/
kill %1
```

Esperado: `{"message":"Welcome to TIME FLOW"}`, sem nenhum `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 7: Verificar que nada regrediu**

```bash
cd server && npm test && npm run typecheck
```

Esperado: 79 testes passando, typecheck limpo.

- [ ] **Step 8: Commit**

```bash
git add server/tsconfig.json server/tsconfig.build.json server/package.json
git commit -m "fix(server): emit CommonJS so the production build actually runs"
```

---

### Task 2: Bind em 0.0.0.0 e bootstrap que falha alto

`server/src/server.ts:47` chama `app.listen({ port })` sem `host`. O default do Fastify é `127.0.0.1`: dentro de um container o serviço não recebe tráfego externo, e o sintoma é um deploy que sobe "com sucesso" e responde 502. Não aparece em dev.

O mesmo `listen` não tem `await` nem callback: uma falha de bind vira unhandled rejection enquanto o `console.log` seguinte afirma que o servidor está rodando.

Esta tarefa também separa a montagem da aplicação do bootstrap do processo, o que torna as rotas testáveis via `app.inject()` — a Task 3 depende disso.

**Files:**
- Create: `server/src/app.ts`
- Modify: `server/src/server.ts` (arquivo inteiro)
- Modify: `server/src/config/env.ts`

**Interfaces:**
- Consumes: build funcional da Task 1.
- Produces: `buildApp(): FastifyInstance` exportado de `src/app.ts`; `env.host: string`. A Task 3 registra uma rota dentro de `buildApp` e a testa com `app.inject()`.

- [ ] **Step 1: Adicionar host e nodeEnv ao env**

Em `server/src/config/env.ts`, substitua o objeto `env`:

```ts
export const env = {
  port: Number(process.env.PORT ?? 3333),
  // Em container, o default do Fastify (127.0.0.1) faria o serviço não
  // receber tráfego externo. 0.0.0.0 escuta em todas as interfaces.
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
};
```

`webOrigin` continua como está — a Task 4 cuida dele.

- [ ] **Step 2: Extrair a montagem da aplicação**

Crie `server/src/app.ts` com o conteúdo que hoje vive em `server.ts`, sem o `listen`:

```ts
import "dotenv/config";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { fastify, FastifyInstance } from "fastify";
import { corsOptions } from "./config/cors";
import { env } from "./config/env";
import { errorHandler } from "./lib/errorHandler";
import { availabilityRoutes } from "./routes/availabilityRoutes";
import { authRoutes } from "./routes/authRoutes";
import { businessRoutes } from "./routes/businessRoutes";
import { dashboardRoutes } from "./routes/dashboardRoutes";
import { employeeRoutes } from "./routes/employeeRoutes";
import { publicRoutes } from "./routes/publicRoutes";
import { serviceRoutes } from "./routes/serviceRoutes";
import "./interfaces/auth";

// Monta a aplicação sem subir o processo. Separar as duas coisas é o que
// permite testar rotas com app.inject() sem abrir porta.
export function buildApp(): FastifyInstance {
  const app = fastify({
    ajv: {
      customOptions: {
        removeAdditional: true,
        coerceTypes: true,
        allErrors: true,
      },
    },
  });

  app.register(fastifyCors, corsOptions);
  app.register(fastifyJwt, { secret: env.jwtSecret });
  app.setErrorHandler(errorHandler);

  app.get("/", async () => {
    return { message: "Welcome to TIME FLOW" };
  });

  app.register(authRoutes);
  app.register(businessRoutes);
  app.register(dashboardRoutes);
  app.register(serviceRoutes);
  app.register(employeeRoutes);
  app.register(availabilityRoutes);
  app.register(publicRoutes);

  return app;
}
```

- [ ] **Step 3: Reescrever o server.ts como bootstrap**

Substitua o conteúdo inteiro de `server/src/server.ts`:

```ts
import { buildApp } from "./app";
import { env } from "./config/env";

async function start(): Promise<void> {
  const app = buildApp();

  try {
    await app.listen({ port: env.port, host: env.host });
    console.log(`Server listening on ${env.host}:${env.port}`);
  } catch (error) {
    // Sem isto, uma falha de bind vira unhandled rejection e o processo
    // continua de pé sem atender ninguém — o provedor marcaria como saudável.
    app.log.error(error);
    process.exit(1);
  }
}

start();
```

- [ ] **Step 4: Verificar que o bind é em todas as interfaces**

```bash
cd server
npm run build
node dist/server.js &
sleep 2
lsof -nP -iTCP:3333 -sTCP:LISTEN | tail -1
curl -s http://localhost:3333/
kill %1
```

Esperado: a linha do `lsof` mostra `*:3333` (todas as interfaces), **não** `127.0.0.1:3333`. O `curl` responde `{"message":"Welcome to TIME FLOW"}`.

- [ ] **Step 5: Verificar que a falha de bind derruba o processo**

Com o servidor já rodando numa porta, suba outro na mesma:

```bash
cd server
node dist/server.js &
sleep 2
node dist/server.js; echo "exit code: $?"
kill %1
```

Esperado: o segundo processo loga o erro `EADDRINUSE` e sai com `exit code: 1` — não fica pendurado imprimindo que está rodando.

- [ ] **Step 6: Verificar que nada regrediu**

```bash
cd server && npm test && npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add server/src/app.ts server/src/server.ts server/src/config/env.ts
git commit -m "fix(server): listen on all interfaces and exit on bind failure"
```

---

### Task 3: Healthcheck que enxerga o banco

O provedor precisa de uma rota para decidir se a instância está saudável. `GET /` serve de sinal de vida, mas responde 200 mesmo com o Postgres inacessível — exatamente o cenário que mais importa detectar num deploy novo.

A lógica pura (`booleano → relatório`) fica em `healthRules.ts` e é testada; o ping no banco fica no repositório e não é testado unitariamente, seguindo a convenção do projeto de não exigir banco nos testes.

**Files:**
- Create: `server/src/services/healthRules.ts`
- Create: `server/src/services/healthRules.test.ts`
- Create: `server/src/repositories/healthRepository.ts`
- Create: `server/src/routes/healthRoutes.ts`
- Modify: `server/src/app.ts` (registrar a rota)

**Interfaces:**
- Consumes: `buildApp()` da Task 2.
- Produces: `GET /health` respondendo 200 com `{"status":"ok","database":"up"}` ou 503 com `{"status":"degraded","database":"down"}`. A Task 8 configura o healthcheck do Railway para esta rota.

- [ ] **Step 1: Escrever o teste que falha**

`server/src/services/healthRules.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHealthReport } from "./healthRules";

test("banco alcançável reporta serviço saudável", () => {
  assert.deepEqual(buildHealthReport(true), { status: "ok", database: "up" });
});

test("banco inalcançável degrada o serviço", () => {
  assert.deepEqual(buildHealthReport(false), {
    status: "degraded",
    database: "down",
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd server && npm test 2>&1 | grep -A2 healthRules
```

Esperado: FALHA — `Cannot find module './healthRules'`.

- [ ] **Step 3: Implementar o mínimo**

`server/src/services/healthRules.ts`:

```ts
export interface HealthReport {
  status: "ok" | "degraded";
  database: "up" | "down";
}

// A API sem banco não serve para nada: responder 200 nesse estado faria o
// provedor manter no ar uma instância que erra toda requisição real.
export function buildHealthReport(databaseReachable: boolean): HealthReport {
  return databaseReachable
    ? { status: "ok", database: "up" }
    : { status: "degraded", database: "down" };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
cd server && npm test 2>&1 | grep -E "^. (pass|fail)"
```

Esperado: 81 passando, 0 falhando.

- [ ] **Step 5: Implementar o ping no banco**

`server/src/repositories/healthRepository.ts`:

```ts
import { prisma } from "../lib/prisma";

export const healthRepository = {
  async isReachable(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
};
```

- [ ] **Step 6: Implementar a rota**

`server/src/routes/healthRoutes.ts`:

```ts
import { FastifyInstance } from "fastify";
import { healthRepository } from "../repositories/healthRepository";
import { buildHealthReport } from "../services/healthRules";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const report = buildHealthReport(await healthRepository.isReachable());

    return reply.status(report.status === "ok" ? 200 : 503).send(report);
  });
}
```

- [ ] **Step 7: Registrar a rota**

Em `server/src/app.ts`, adicione o import junto aos outros de rotas:

```ts
import { healthRoutes } from "./routes/healthRoutes";
```

E o registro logo antes de `app.register(authRoutes)`:

```ts
  app.register(healthRoutes);
```

- [ ] **Step 8: Verificar com o banco no ar**

```bash
cd server
npm run build && node dist/server.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/health
curl -s http://localhost:3333/health
kill %1
```

Esperado: `200` e `{"status":"ok","database":"up"}`.

- [ ] **Step 9: Verificar com o banco derrubado**

```bash
cd server
docker compose stop postgres
node dist/server.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/health
curl -s http://localhost:3333/health
kill %1
docker compose start postgres
```

Esperado: `503` e `{"status":"degraded","database":"down"}`.

- [ ] **Step 10: Commit**

```bash
git add server/src/services/healthRules.ts server/src/services/healthRules.test.ts server/src/repositories/healthRepository.ts server/src/routes/healthRoutes.ts server/src/app.ts
git commit -m "feat(server): add health route that checks database reachability"
```

---

### Task 4: CORS com lista de origens

`server/src/config/cors.ts:7` passa `env.webOrigin`, uma string única. Em produção são pelo menos duas origens: o domínio final e, se você usar previews da Vercel, os `*.vercel.app`. Com origem única, a segunda quebra no preflight e o sintoma no browser é genérico.

**Files:**
- Create: `server/src/config/origins.ts`
- Create: `server/src/config/origins.test.ts`
- Modify: `server/src/config/env.ts`
- Modify: `server/src/config/cors.ts:7`
- Modify: `server/src/config/cors.test.ts:22`
- Modify: `server/.env.example`

**Interfaces:**
- Consumes: `env` da Task 2.
- Produces: `env.webOrigins: string[]`. `env.webOrigin` deixa de existir — quem usava passa a usar a lista.

- [ ] **Step 1: Escrever o teste que falha**

`server/src/config/origins.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOrigins } from "./origins";

test("variável ausente cai no front local", () => {
  assert.deepEqual(parseOrigins(undefined), ["http://localhost:3000"]);
});

test("string vazia cai no front local", () => {
  assert.deepEqual(parseOrigins(""), ["http://localhost:3000"]);
});

test("origem única vira lista de um", () => {
  assert.deepEqual(parseOrigins("https://app.exemplo.com"), [
    "https://app.exemplo.com",
  ]);
});

test("lista separada por vírgula ignora espaços em volta", () => {
  assert.deepEqual(
    parseOrigins("https://app.exemplo.com, https://exemplo.vercel.app"),
    ["https://app.exemplo.com", "https://exemplo.vercel.app"],
  );
});

test("vírgula sobrando não vira origem vazia", () => {
  assert.deepEqual(parseOrigins("https://app.exemplo.com,,"), [
    "https://app.exemplo.com",
  ]);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd server && npm test 2>&1 | grep -A2 origins
```

Esperado: FALHA — `Cannot find module './origins'`.

- [ ] **Step 3: Implementar o mínimo**

`server/src/config/origins.ts`:

```ts
const LOCAL_WEB = "http://localhost:3000";

// Produção tem mais de uma origem legítima: o domínio final e as URLs de
// preview do provedor do front. Uma origem só faria a segunda quebrar no
// preflight, com erro genérico no browser.
export function parseOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : [LOCAL_WEB];
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
cd server && npm test 2>&1 | grep -E "^. (pass|fail)"
```

Esperado: 86 passando, 0 falhando.

- [ ] **Step 5: Trocar webOrigin por webOrigins no env**

Em `server/src/config/env.ts`, adicione o import no topo:

```ts
import { parseOrigins } from "./origins";
```

E substitua a linha de `webOrigin`:

```ts
  webOrigins: parseOrigins(process.env.WEB_ORIGIN),
```

- [ ] **Step 6: Passar a lista para o CORS**

Em `server/src/config/cors.ts`, substitua a linha 7:

```ts
  origin: env.webOrigins,
```

- [ ] **Step 7: Ajustar o teste de CORS existente**

Em `server/src/config/cors.test.ts:22`, substitua:

```ts
      origin: env.webOrigins[0],
```

- [ ] **Step 8: Documentar o formato no .env.example**

Em `server/.env.example`, substitua o bloco de `WEB_ORIGIN`:

```bash
# Origens do front-end autorizadas no CORS. Aceita uma lista separada por
# vírgula — em produção, o domínio final e as URLs de preview do front.
WEB_ORIGIN="http://localhost:3000"

# Interface de rede. 0.0.0.0 é o necessário em container; em dev, tanto faz.
HOST="0.0.0.0"

# development em dev, production no provedor.
NODE_ENV="development"
```

- [ ] **Step 9: Verificar tudo**

```bash
cd server && npm test && npm run typecheck
```

Esperado: 86 testes passando (os 4 de preflight continuam verdes), typecheck limpo.

- [ ] **Step 10: Commit**

```bash
git add server/src/config/origins.ts server/src/config/origins.test.ts server/src/config/env.ts server/src/config/cors.ts server/src/config/cors.test.ts server/.env.example
git commit -m "feat(server): accept a comma-separated list of CORS origins"
```

---

### Task 5: Node fixado e scripts de release

Sem `engines` nem `.nvmrc`, o provedor escolhe a versão do Node à revelia — e a máquina local está no 25, que não é LTS. Falta também o `postinstall` que gera o Prisma Client (ele não vai versionado) e um script de `migrate deploy` separado do `migrate dev`, que jamais pode rodar em produção.

**Files:**
- Create: `server/.nvmrc`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: build da Task 1.
- Produces: `npm run db:deploy` aplica migrations sem prompt. A Task 7 usa esse script.

- [ ] **Step 1: Fixar a versão do Node**

`server/.nvmrc`:

```
22
```

- [ ] **Step 2: Declarar engines e os scripts de release**

Em `server/package.json`, adicione o bloco `engines` logo depois de `"license"`:

```json
  "engines": {
    "node": ">=22 <23"
  },
```

E no bloco `scripts`, adicione:

```json
    "postinstall": "prisma generate",
    "db:deploy": "prisma migrate deploy",
```

- [ ] **Step 3: Verificar que o postinstall funciona do zero**

```bash
cd server
rm -rf node_modules/.prisma
npm install
ls node_modules/.prisma/client | head -3
```

Esperado: o diretório do client gerado existe — o `postinstall` rodou sozinho.

- [ ] **Step 4: Verificar o migrate deploy contra o banco local**

```bash
cd server && npm run db:deploy
```

Esperado: `No pending migrations to apply.` (as 4 já estão aplicadas). O comando não abre nenhum prompt interativo — é isso que o torna seguro em pipeline.

- [ ] **Step 5: Verificar que nada regrediu**

```bash
cd server && npm test && npm run typecheck && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add server/.nvmrc server/package.json
git commit -m "chore(server): pin node version and add release scripts"
```

---

### Task 6: Seed que recusa senha padrão em produção

`server/prisma/seed.ts:8-9` cria o superadmin com `SuperAdmin123!` quando `SEED_SUPERADMIN_PASSWORD` não está definida. Essa senha está no GitHub. Rodar o seed em produção sem setar a variável entrega a conta mais poderosa do sistema com credencial pública.

O seed também cria um usuário de convite de teste, que não tem razão de existir em produção.

**Files:**
- Create: `server/prisma/seedCredentials.ts`
- Create: `server/prisma/seedCredentials.test.ts`
- Modify: `server/prisma/seed.ts`
- Modify: `server/package.json` (incluir os testes de `prisma/` na suíte)

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces: `resolveSeedCredentials(source)` e `shouldSeedTestInvite(nodeEnv)`. A Task 7 roda o seed em produção com a variável definida.

- [ ] **Step 1: Escrever o teste que falha**

`server/prisma/seedCredentials.test.ts`:

```ts
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
```

- [ ] **Step 2: Fazer a suíte enxergar os testes de prisma/**

O script atual só varre `src/`. Em `server/package.json`, substitua o script `test`:

```json
    "test": "node --import tsx --test src/**/*.test.ts prisma/*.test.ts",
```

- [ ] **Step 3: Rodar o teste e ver falhar**

```bash
cd server && npm test 2>&1 | grep -A2 seedCredentials
```

Esperado: FALHA — `Cannot find module './seedCredentials'`.

- [ ] **Step 4: Implementar o mínimo**

`server/prisma/seedCredentials.ts`:

```ts
const DEFAULT_EMAIL = "superadmin@timeflow.com";
// Esta senha está no repositório público. Serve para dev e para nada mais.
const DEFAULT_PASSWORD = "SuperAdmin123!";

interface SeedSource {
  nodeEnv: string;
  email?: string;
  password?: string;
}

export interface SeedCredentials {
  email: string;
  password: string;
}

export function resolveSeedCredentials(source: SeedSource): SeedCredentials {
  const isProduction = source.nodeEnv === "production";
  const password = source.password ?? DEFAULT_PASSWORD;

  if (isProduction && password === DEFAULT_PASSWORD) {
    throw new Error(
      "SEED_SUPERADMIN_PASSWORD é obrigatória em produção: a senha padrão está publicada no repositório.",
    );
  }

  return { email: source.email ?? DEFAULT_EMAIL, password };
}

// O usuário de convite pendente existe para testar o fluxo de aceite à mão.
// Em produção seria só uma conta órfã com token válido.
export function shouldSeedTestInvite(nodeEnv: string): boolean {
  return nodeEnv !== "production";
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

```bash
cd server && npm test 2>&1 | grep -E "^. (pass|fail)"
```

Esperado: 92 passando, 0 falhando.

- [ ] **Step 6: Ligar o seed nas credenciais**

Em `server/prisma/seed.ts`, substitua as linhas 7–10 (as três constantes de topo) por:

```ts
import { resolveSeedCredentials, shouldSeedTestInvite } from "./seedCredentials";

const NODE_ENV = process.env.NODE_ENV ?? "development";
const { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD } =
  resolveSeedCredentials({
    nodeEnv: NODE_ENV,
    email: process.env.SEED_SUPERADMIN_EMAIL,
    password: process.env.SEED_SUPERADMIN_PASSWORD,
  });
const PENDING_INVITE_EMAIL =
  process.env.SEED_PENDING_INVITE_EMAIL ?? "convite-teste@timeflow.com";
```

O import vai junto dos outros, no topo do arquivo.

E substitua o corpo de `main`:

```ts
async function main(): Promise<void> {
  await seedSuperadmin();

  if (shouldSeedTestInvite(NODE_ENV)) {
    await seedPendingInvite();
  }
}
```

- [ ] **Step 7: Verificar que o seed recusa produção sem senha**

```bash
cd server && NODE_ENV=production npm run db:seed; echo "exit code: $?"
```

Esperado: erro mencionando `SEED_SUPERADMIN_PASSWORD` e `exit code: 1`. Nenhum usuário criado.

- [ ] **Step 8: Verificar que dev continua funcionando**

```bash
cd server && npm run db:seed
```

Esperado: roda sem erro, imprimindo o superadmin e o convite de teste (ou que já existem).

- [ ] **Step 9: Documentar as variáveis**

Em `server/.env.example`, acrescente ao final:

```bash
# Credenciais do superadmin criado pelo seed. Em produção são obrigatórias:
# o seed recusa rodar com a senha padrão, que está publicada no repositório.
# SEED_SUPERADMIN_EMAIL=""
# SEED_SUPERADMIN_PASSWORD=""
```

- [ ] **Step 10: Commit**

```bash
git add server/prisma/seedCredentials.ts server/prisma/seedCredentials.test.ts server/prisma/seed.ts server/package.json server/.env.example
git commit -m "fix(server): refuse to seed production with the repo default password"
```

---

### Task 7: Postgres gerenciado no Railway

Primeira tarefa de infraestrutura. Nenhuma linha de código. Provisiona o banco e aplica as 4 migrations existentes a partir da máquina local, antes de existir qualquer serviço no ar — assim uma falha de migration aparece isolada, sem se confundir com falha de deploy.

**Files:** nenhum.

**Interfaces:**
- Consumes: `npm run db:deploy` da Task 5, seed da Task 6.
- Produces: uma `DATABASE_URL` de produção com o schema aplicado e um superadmin real. As Tasks 8 e 11 dependem dela.

- [ ] **Step 1: Criar o projeto e o banco**

No Railway (`railway.app`), crie um projeto novo e adicione um Postgres pelo catálogo de serviços. Anote a região escolhida — a API da Task 8 vai na mesma, para não pagar latência de rede entre os dois.

- [ ] **Step 2: Copiar a connection string**

No serviço Postgres, aba de variáveis, copie a `DATABASE_URL` pública (a que é acessível de fora do Railway). Ela contém a senha: não cole em arquivo do repositório, em issue, nem em chat.

- [ ] **Step 3: Aplicar as migrations a partir da máquina local**

```bash
cd server
DATABASE_URL="<a url copiada>" npm run db:deploy
```

Esperado: as 4 migrations aplicadas, em ordem, terminando em `20260725_booking_occupies_many_slots`.

- [ ] **Step 4: Conferir o schema no banco real**

```bash
cd server
DATABASE_URL="<a url copiada>" npx prisma migrate status
```

Esperado: `Database schema is up to date!`.

- [ ] **Step 5: Criar o superadmin de produção**

Escolha uma senha longa e aleatória (`openssl rand -base64 24`) e guarde no seu gerenciador de senhas antes de rodar:

```bash
cd server
DATABASE_URL="<a url copiada>" \
NODE_ENV=production \
SEED_SUPERADMIN_EMAIL="<seu e-mail>" \
SEED_SUPERADMIN_PASSWORD="<a senha gerada>" \
npm run db:seed
```

Esperado: `Superadmin created:` com o seu e-mail. O usuário de convite de teste **não** deve ser criado — `shouldSeedTestInvite` barra em produção.

- [ ] **Step 6: Confirmar que só existe o superadmin**

```bash
cd server
DATABASE_URL="<a url copiada>" npx prisma studio
```

Na tabela `User`, esperado: exatamente uma linha, com `role = SUPERADMIN` e o seu e-mail. Feche o Studio ao terminar.

---

### Task 8: API no ar

**Files:** nenhum no repositório — a configuração vive no provedor.

**Interfaces:**
- Consumes: build da Task 1, bind da Task 2, `/health` da Task 3, banco da Task 7.
- Produces: uma URL pública da API. As Tasks 9 e 10 apontam para ela.

- [ ] **Step 1: Criar o serviço a partir do repositório**

No mesmo projeto Railway, adicione um serviço apontando para o repositório `daviaieta/TimeFlow`, branch `main`. Configure o **root directory** como `server` — sem isso o provedor tenta buildar a raiz do monorepo e não encontra `package.json`.

- [ ] **Step 2: Configurar build e start**

Build: `npm run build`. Start: `npm start`. O `postinstall` da Task 5 cuida do `prisma generate` sozinho durante o install.

- [ ] **Step 3: Definir as variáveis de ambiente**

No serviço da API:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | referência à variável do serviço Postgres (use a referência do Railway, não o texto copiado) |
| `JWT_SECRET` | `openssl rand -base64 48`, gerado agora e guardado no gerenciador de senhas |
| `NODE_ENV` | `production` |
| `WEB_ORIGIN` | deixe vazio por enquanto; a Task 9 preenche com a URL da Vercel |
| `PORT` | o Railway injeta sozinho — só defina se ele não injetar |

Não defina `HOST`: o default `0.0.0.0` da Task 2 já é o correto.

- [ ] **Step 4: Configurar o healthcheck**

Aponte o healthcheck do serviço para `/health`. É a rota da Task 3, que responde 503 se o banco estiver inalcançável — o que impede o provedor de manter no ar uma instância que erra toda requisição real.

- [ ] **Step 5: Publicar e acompanhar o log**

Dispare o deploy e leia o log até o fim. Esperado: `Server listening on 0.0.0.0:<porta>`. Se aparecer `ERR_MODULE_NOT_FOUND`, a Task 1 não foi aplicada; se subir mas o healthcheck falhar por timeout, o bind da Task 2 não foi aplicado.

- [ ] **Step 6: Verificar de fora**

```bash
curl -s https://<url-da-api>/
curl -s -o /dev/null -w "%{http_code}\n" https://<url-da-api>/health
curl -s https://<url-da-api>/health
```

Esperado: a mensagem de boas-vindas, `200`, e `{"status":"ok","database":"up"}` — este último provando que a API enxerga o Postgres.

- [ ] **Step 7: Verificar que o login de produção funciona**

```bash
curl -s -X POST https://<url-da-api>/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<seu e-mail>","password":"<a senha do seed>"}'
```

Esperado: JSON com um token. Isso prova banco, hash de senha e JWT funcionando juntos em produção.

---

### Task 9: Front-end no ar

**Files:**
- Modify: `web/.env.example` (comentar o valor de produção)

**Interfaces:**
- Consumes: URL da API da Task 8.
- Produces: uma URL pública do front. A Task 10 aponta o domínio para ela.

- [ ] **Step 1: Importar o projeto na Vercel**

Importe o repositório `daviaieta/TimeFlow`. Configure o **root directory** como `web`. O framework é detectado como Next.js; não sobrescreva os comandos de build.

- [ ] **Step 2: Definir a variável de ambiente**

`NEXT_PUBLIC_API_URL` = a URL da API da Task 8, sem barra no final. `NEXT_PUBLIC_` é embutido no bundle em build time: mudar esse valor exige um redeploy, não basta reiniciar.

- [ ] **Step 3: Publicar e verificar a landing**

Abra a URL da Vercel. Esperado: a landing page carrega.

- [ ] **Step 4: Liberar a origem no CORS da API**

De volta ao serviço da API no Railway, defina `WEB_ORIGIN` com a URL da Vercel (sem barra no final) e redeploy. A Task 4 fez essa variável aceitar lista separada por vírgula — se você quiser usar deploys de preview, acrescente a URL de preview aqui, separada por vírgula.

- [ ] **Step 5: Verificar o preflight de produção**

```bash
curl -s -i -X OPTIONS https://<url-da-api>/auth/login \
  -H "Origin: https://<url-da-vercel>" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control
```

Esperado: `access-control-allow-origin` ecoando a URL da Vercel e `access-control-allow-methods` incluindo POST, PUT e DELETE.

- [ ] **Step 6: Verificar o login pelo browser**

Abra `https://<url-da-vercel>/login` e entre com o superadmin. Esperado: o login conclui e o dashboard carrega. Se o console do browser acusar erro de CORS, o Step 4 não propagou — confirme que o redeploy da API terminou.

- [ ] **Step 7: Documentar e commitar**

Em `web/.env.example`, acrescente:

```bash
# Em produção, a URL pública da API, sem barra no final. Por ser NEXT_PUBLIC_,
# o valor é embutido no bundle em build time: mudá-lo exige novo deploy.
```

```bash
git add web/.env.example
git commit -m "docs(web): note that the API URL is baked in at build time"
```

---

### Task 10: Domínio próprio

**Files:** nenhum.

**Interfaces:**
- Consumes: serviços no ar das Tasks 8 e 9.
- Produces: `api.<dominio>` e `app.<dominio>` respondendo. A Task 11 testa contra eles.

- [ ] **Step 1: Registrar o domínio**

Registre o domínio no registrador de sua escolha, se ainda não tiver um.

- [ ] **Step 2: Apontar o subdomínio da API**

No Railway, adicione o domínio customizado `api.<dominio>` ao serviço da API. Ele fornece um alvo de CNAME; crie esse registro no seu DNS.

- [ ] **Step 3: Apontar o subdomínio do front**

Na Vercel, adicione `app.<dominio>` ao projeto e crie o registro DNS que ela indicar.

- [ ] **Step 4: Esperar o certificado e conferir o TLS**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.<dominio>/health
curl -s -o /dev/null -w "%{http_code}\n" https://app.<dominio>/
```

Esperado: `200` nos dois, sem aviso de certificado. Se der erro de TLS, o certificado ainda está sendo emitido — aguarde e repita.

- [ ] **Step 5: Reapontar as variáveis para o domínio**

Duas mudanças que precisam acontecer juntas:

- Railway, serviço da API: `WEB_ORIGIN` = `https://app.<dominio>` (mantendo a URL da Vercel na lista, separada por vírgula, se você usa previews).
- Vercel: `NEXT_PUBLIC_API_URL` = `https://api.<dominio>`.

Redeploy dos dois. O front precisa de build novo — a variável é embutida no bundle.

- [ ] **Step 6: Verificar o preflight no domínio final**

```bash
curl -s -i -X OPTIONS https://api.<dominio>/auth/login \
  -H "Origin: https://app.<dominio>" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control
```

Esperado: `access-control-allow-origin: https://app.<dominio>`.

---

### Task 11: Teste de fumaça em produção

Percorre o produto inteiro no ambiente real. É o que prova que a fase 1 terminou: se este caminho fecha, as fases seguintes constroem sobre chão firme.

**Files:**
- Modify: `README.md` (seção de deploy)

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: a confirmação de que o ambiente sustenta o fluxo completo.

- [ ] **Step 1: Criar um negócio como superadmin**

Faça login em `https://app.<dominio>/login` com o superadmin. Pegue o token pelo DevTools (ou repita o `curl` de login da Task 8) e crie um negócio:

```bash
curl -s -X POST https://api.<dominio>/businesses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token do superadmin>" \
  -d '{"name":"Barbearia Teste","slug":"barbearia-teste","admin":{"name":"Dono Teste","email":"<um e-mail seu>"}}'
```

Esperado: 201 com o negócio criado. Ainda não existe tela para isso — o painel de SUPERADMIN é a fase 2.

- [ ] **Step 2: Aceitar o convite**

O e-mail de convite não é entregue de verdade (sem SMTP configurado, o mailer usa conta de teste Ethereal — a fase 4 resolve). Pegue o token direto do banco:

```bash
cd server
DATABASE_URL="<url do postgres>" npx prisma studio
```

Na tabela `User`, copie o `inviteToken` do admin recém-criado e abra `https://app.<dominio>/accept-invite?token=<token>`. Defina a senha.

- [ ] **Step 3: Montar o negócio pelo dashboard**

Logado como o admin, em `https://app.<dominio>/dashboard`:

1. Crie um serviço de 30 minutos e um de 60 minutos.
2. Crie um colaborador e vincule os dois serviços a ele.
3. Aceite o convite do colaborador pelo mesmo caminho do Step 2 e, como ele, gere a agenda da semana.

Esperado: cada passo persiste e reaparece após recarregar a página.

- [ ] **Step 4: Reservar pelo link público**

Abra `https://app.<dominio>/barbearia-teste` numa janela anônima e reserve o **serviço de 60 minutos**. Esperado: o wizard conclui e mostra o resumo terminando 60 minutos após o início.

- [ ] **Step 5: Verificar o multi-slot em produção**

Volte ao dashboard como admin. Esperado: a agenda mostra o compromisso ocupando dois slots de 30 minutos, e o dashboard conta **uma** reserva e **uma** vez o preço do serviço — não duas. É a correção da fase 0 valendo no ambiente real.

- [ ] **Step 6: Verificar o isolamento pelo próprio ambiente**

Ainda na janela anônima, tente `https://app.<dominio>/negocio-que-nao-existe`. Esperado: erro de negócio não encontrado, sem vazar dados de nenhum outro negócio.

- [ ] **Step 7: Limpar os dados de teste**

Apague o negócio de teste e seus usuários pelo Prisma Studio, na ordem inversa das dependências: `Booking`, `Availability`, `EmployeeService`, `Service`, `User` (menos o superadmin), `Business`.

- [ ] **Step 8: Documentar o deploy no README**

Acrescente ao final de `README.md`:

```markdown
## Deploy

O front-end roda na Vercel (root em `web/`) e a API no Railway (root em
`server/`), com Postgres gerenciado no mesmo projeto Railway.

Variáveis exigidas pela API em produção: `DATABASE_URL`, `JWT_SECRET`,
`NODE_ENV=production` e `WEB_ORIGIN` — esta última aceita uma lista separada
por vírgula. O front exige `NEXT_PUBLIC_API_URL`, embutida no bundle em build
time: mudá-la exige novo deploy, não basta reiniciar.

Migrations em produção rodam com `npm run db:deploy` (`prisma migrate deploy`),
nunca com `migrate dev`. O healthcheck fica em `GET /health` e responde 503
quando o banco está inalcançável.
```

- [ ] **Step 9: Commit**

```bash
git add README.md
git commit -m "docs: describe the production deploy"
```

---

## Self-Review

**Cobertura do escopo da fase 1:** build de produção (Task 1), bind de rede (Task 2), healthcheck (Task 3), CORS com múltiplas origens (Task 4), versão do Node e scripts de release (Task 5), seed seguro (Task 6), Postgres gerenciado (Task 7), API no ar (Task 8), web no ar (Task 9), domínio (Task 10), fumaça ponta a ponta (Task 11). Todos os pontos levantados no plano falado têm tarefa correspondente.

**Fora do escopo, por decisão:** CI, monitoramento, backup automatizado e ambiente de staging — coisas de produto vivo, não de esqueleto.

**Consistência de tipos:** `buildApp(): FastifyInstance` (Task 2) é consumido pela Task 3. `env.host` (Task 2) é consumido pela Task 2. `env.webOrigins: string[]` (Task 4) substitui `env.webOrigin` em `cors.ts` e `cors.test.ts` na mesma tarefa — nenhum consumidor fica órfão. `buildHealthReport(boolean): HealthReport` (Task 3) é usado só na rota da mesma tarefa. `resolveSeedCredentials(SeedSource): SeedCredentials` e `shouldSeedTestInvite(string): boolean` (Task 6) são usados no `seed.ts` da mesma tarefa e invocados na Task 7.

**Contagem de testes esperada por tarefa:** 79 no início → 81 (Task 3) → 86 (Task 4) → 92 (Task 6).
