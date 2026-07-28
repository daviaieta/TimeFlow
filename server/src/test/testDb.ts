import "dotenv/config";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// ATENÇÃO À ORDEM DE IMPORT: todo arquivo de teste de integração precisa
// importar ESTE módulo antes de qualquer coisa que toque em `lib/prisma`
// (inclusive `../app`). O PrismaClient lê DATABASE_URL na hora em que é
// construído, no topo de `lib/prisma.ts`; se aquele módulo for avaliado
// primeiro, o teste conecta no banco de desenvolvimento e apaga os dados
// reais no primeiro reset.
const TEST_SCHEMA = "test";

// Mesmo Postgres do docker-compose, schema separado. Schema em vez de outro
// database porque `prisma migrate deploy` cria o schema sozinho — criar um
// database exigiria um passo manual (createdb) fora do Prisma.
function buildTestDatabaseUrl(): string {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      "DATABASE_URL não definida — suba o Postgres (docker compose up -d) e configure o .env antes de rodar os testes de integração.",
    );
  }

  const url = new URL(base);
  url.searchParams.set("schema", TEST_SCHEMA);
  return url.toString();
}

export const testDatabaseUrl = buildTestDatabaseUrl();
process.env.DATABASE_URL = testDatabaseUrl;

// Trava de segurança: `resetDatabase` é um TRUNCATE disfarçado. Se a URL
// apontar para qualquer schema que não seja o de teste, é porque a ordem de
// import quebrou — melhor explodir do que apagar o banco de desenvolvimento.
function assertTestSchema(): void {
  const schema = new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema");
  if (schema !== TEST_SCHEMA) {
    throw new Error(
      `Recusando operar: DATABASE_URL aponta para o schema "${schema}", não "${TEST_SCHEMA}".`,
    );
  }
}

export const testPrisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });

let migrated = false;

async function schemaIsReady(): Promise<boolean> {
  // O nome vai como parâmetro (to_regclass aceita texto): interpolar direto
  // no SQL colocaria o placeholder dentro de um literal, que o Postgres não
  // substitui.
  const qualifiedName = `"${TEST_SCHEMA}"."Business"`;
  const rows = await testPrisma.$queryRaw<{ found: string | null }[]>`
    SELECT to_regclass(${qualifiedName})::text AS found
  `;
  return rows[0]?.found != null;
}

// Sempre aplica o que estiver pendente. É isto que o `pretest:integration`
// chama, e precisa ser incondicional: checar só se as tabelas existem faria
// uma migration NOVA nunca chegar ao schema de teste, e a suíte inteira
// quebraria contra colunas que já existem em desenvolvimento.
export async function applyMigrations(): Promise<void> {
  assertTestSchema();

  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: "pipe",
    });
  } catch (error) {
    // Dois arquivos de teste rodando em paralelo podem chamar
    // `migrate deploy` ao mesmo tempo e o segundo esbarra na criação do
    // schema (P2002 em `nspname`). Se o schema ficou de pé, a corrida não
    // machucou ninguém.
    if (!(await schemaIsReady())) throw error;
  }

  migrated = true;
}

// Chamado no `before` de cada arquivo. O caso normal é não fazer nada: o
// `pretest:integration` já migrou tudo num processo só. A migração aqui é
// para quem roda um arquivo solto, sem passar pelo npm script.
export async function ensureTestSchema(): Promise<void> {
  if (migrated) return;
  assertTestSchema();

  if (!(await schemaIsReady())) {
    await applyMigrations();
  }

  migrated = true;
}

// Ordem ditada pelas foreign keys: Availability aponta para Booking, Booking
// aponta para Service, e Service/User apontam para Business.
export async function resetDatabase(): Promise<void> {
  assertTestSchema();

  await testPrisma.availability.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.employeeService.deleteMany();
  await testPrisma.service.deleteMany();
  await testPrisma.user.deleteMany();
  await testPrisma.business.deleteMany();
  await testPrisma.contactMessage.deleteMany();
}
