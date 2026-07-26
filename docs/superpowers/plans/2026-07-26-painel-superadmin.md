# Painel do SUPERADMIN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o stub que o SUPERADMIN vê hoje em `/dashboard` por um painel operacional que lista os negócios da plataforma, cadastra negócios novos e reenvia convites parados.

**Architecture:** Duas rotas novas estendem `/businesses` (sem namespace por papel), guardadas por `authorize(Role.SUPERADMIN)`. `GET /businesses` faz três queries flat em `Promise.all` e delega o merge para um módulo puro `platformRules.ts`, no mesmo formato de `dashboardRules.ts`. No front, `web/app/dashboard/page.tsx` ganha um branch para SUPERADMIN que renderiza `<PlatformOverview />`, componente próprio com o próprio fetch.

**Tech Stack:** Fastify 5 · Prisma 6.1 (PostgreSQL) · Next.js 16 (App Router) · React 19 · shadcn/ui sobre Base UI · HugeIcons · testes com `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-26-painel-superadmin-design.md`

## Global Constraints

- Todo schema JSON de rota Fastify novo inclui `additionalProperties: false`.
- Rotas novas usam `preHandler: [authenticate, authorize(Role.SUPERADMIN)]`.
- Camadas: `routes` → `controller` (fino, zero lógica) → `service` → `repository`. Lógica de agregação vai em módulo puro que não importa Prisma.
- Mensagens de erro do servidor em inglês (como `server/src/lib/errors.ts`); a tradução para pt-BR é do front.
- UI em português. Toda tela nova nasce mobile-first: abaixo de `sm`, cards empilhados em vez de tabela com scroll horizontal.
- `password === null` é a convenção do projeto para "convite pendente" (`server/src/services/dashboardService.ts:76`).
- Testes do servidor: `cd server && npm test`. Typecheck: `npm run typecheck`. Testes do front: `cd web && npm test`.
- Testes do front importam com extensão explícita (`from "./platform.ts"`), como `web/lib/dashboard.test.ts`.

---

### Task 1: Regras puras da plataforma

**Files:**
- Create: `server/src/services/platformRules.ts`
- Test: `server/src/services/platformRules.test.ts`

**Interfaces:**
- Consumes: `Role` de `@prisma/client`.
- Produces: `BusinessBaseRow`, `RoleCountRow`, `PendingInviteRow`, `PendingInvite`, `BusinessRow`, `PlatformTotals`, `PlatformOverview`, `buildBusinessRows(businesses: BusinessBaseRow[], roleCounts: RoleCountRow[], pendingInvites: PendingInviteRow[]): BusinessRow[]`, `buildPlatformTotals(rows: BusinessRow[]): PlatformTotals`. A Task 2 importa tudo isso.

- [ ] **Step 1: Write the failing test**

Criar `server/src/services/platformRules.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@prisma/client";
import {
  BusinessBaseRow,
  PendingInviteRow,
  RoleCountRow,
  buildBusinessRows,
  buildPlatformTotals,
} from "./platformRules";

function business(overrides: Partial<BusinessBaseRow> = {}): BusinessBaseRow {
  return {
    id: 1,
    name: "Barbearia do Zé",
    slug: "barbearia-do-ze",
    createdAt: new Date("2026-07-20T14:03:11.000Z"),
    ...overrides,
  };
}

function count(
  businessId: number | null,
  role: Role,
  total: number,
): RoleCountRow {
  return { businessId, role, _count: { _all: total } };
}

function pending(overrides: Partial<PendingInviteRow> = {}): PendingInviteRow {
  return {
    id: 12,
    name: "Zé",
    email: "ze@x.com",
    role: Role.ADMIN,
    businessId: 1,
    ...overrides,
  };
}

test("negócio sem nenhum usuário zera as contagens em vez de virar undefined", () => {
  const rows = buildBusinessRows([business()], [], []);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].employees, 0);
  assert.equal(rows[0].admins, 0);
  assert.deepEqual(rows[0].pendingInvites, []);
});

test("contagens caem no negócio certo, por papel", () => {
  const rows = buildBusinessRows(
    [business({ id: 1 }), business({ id: 2, slug: "outra" })],
    [
      count(1, Role.EMPLOYEE, 3),
      count(1, Role.ADMIN, 1),
      count(2, Role.EMPLOYEE, 5),
    ],
    [],
  );

  assert.equal(rows[0].employees, 3);
  assert.equal(rows[0].admins, 1);
  assert.equal(rows[1].employees, 5);
  assert.equal(rows[1].admins, 0);
});

test("negócio com dois admins conta dois", () => {
  const rows = buildBusinessRows([business()], [count(1, Role.ADMIN, 2)], []);

  assert.equal(rows[0].admins, 2);
});

// O seed cria um ADMIN órfão (convite-teste@timeflow.com) sem businessId.
// Ele não pertence a negócio nenhum e não pode inflar contagem de ninguém.
test("usuário sem businessId não entra em linha nenhuma", () => {
  const rows = buildBusinessRows(
    [business()],
    [count(null, Role.ADMIN, 9), count(null, Role.SUPERADMIN, 1)],
    [pending({ id: 99, businessId: null })],
  );

  assert.equal(rows[0].admins, 0);
  assert.deepEqual(rows[0].pendingInvites, []);
});

test("convite pendente aparece na linha certa, com id e email", () => {
  const rows = buildBusinessRows(
    [business({ id: 1 }), business({ id: 2, slug: "outra" })],
    [],
    [pending({ id: 12, businessId: 1 }), pending({ id: 13, businessId: 2 })],
  );

  assert.deepEqual(rows[0].pendingInvites, [
    { id: 12, name: "Zé", email: "ze@x.com", role: Role.ADMIN },
  ]);
  assert.equal(rows[1].pendingInvites[0].id, 13);
});

test("createdAt sai como string ISO, pronto para o JSON", () => {
  const rows = buildBusinessRows([business()], [], []);

  assert.equal(rows[0].createdAt, "2026-07-20T14:03:11.000Z");
});

test("a ordem que veio do banco é preservada pelo merge", () => {
  const rows = buildBusinessRows(
    [business({ id: 7, slug: "sete" }), business({ id: 3, slug: "tres" })],
    [],
    [],
  );

  assert.deepEqual(
    rows.map((row) => row.id),
    [7, 3],
  );
});

test("totais somam as linhas", () => {
  const rows = buildBusinessRows(
    [business({ id: 1 }), business({ id: 2, slug: "outra" })],
    [
      count(1, Role.EMPLOYEE, 3),
      count(1, Role.ADMIN, 1),
      count(2, Role.EMPLOYEE, 5),
      count(2, Role.ADMIN, 2),
    ],
    [pending({ id: 12, businessId: 1 }), pending({ id: 13, businessId: 2 })],
  );

  assert.deepEqual(buildPlatformTotals(rows), {
    businesses: 2,
    employees: 8,
    admins: 3,
    pendingInvites: 2,
  });
});

test("plataforma vazia devolve zeros, não NaN", () => {
  assert.deepEqual(buildPlatformTotals([]), {
    businesses: 0,
    employees: 0,
    admins: 0,
    pendingInvites: 0,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/services/platformRules.test.ts`
Expected: FAIL — `Cannot find module './platformRules'`.

- [ ] **Step 3: Write minimal implementation**

Criar `server/src/services/platformRules.ts`:

```ts
import { Role } from "@prisma/client";

// O que o repositório entrega, antes de qualquer merge.
export interface BusinessBaseRow {
  id: number;
  name: string;
  slug: string;
  createdAt: Date;
}

// Formato de saída do prisma.user.groupBy: uma linha por par (negócio, papel).
export interface RoleCountRow {
  businessId: number | null;
  role: Role;
  _count: { _all: number };
}

export interface PendingInviteRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  businessId: number | null;
}

export interface PendingInvite {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface BusinessRow {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  employees: number;
  admins: number;
  pendingInvites: PendingInvite[];
}

export interface PlatformTotals {
  businesses: number;
  employees: number;
  admins: number;
  pendingInvites: number;
}

export interface PlatformOverview {
  totals: PlatformTotals;
  businesses: BusinessRow[];
}

export function buildBusinessRows(
  businesses: BusinessBaseRow[],
  roleCounts: RoleCountRow[],
  pendingInvites: PendingInviteRow[],
): BusinessRow[] {
  // Indexa as duas listas por businessId antes do map: varrê-las dentro do map
  // faria o merge virar O(negócios × usuários).
  const counts = new Map<number, { employees: number; admins: number }>();
  for (const row of roleCounts) {
    // businessId nulo = usuário sem vínculo (o SUPERADMIN, ou o ADMIN órfão do
    // seed). O repositório já filtra, mas o tipo permite null e a regra pura
    // não pode depender de quem a chama.
    if (row.businessId === null) continue;

    const entry = counts.get(row.businessId) ?? { employees: 0, admins: 0 };
    if (row.role === Role.EMPLOYEE) entry.employees = row._count._all;
    if (row.role === Role.ADMIN) entry.admins = row._count._all;
    counts.set(row.businessId, entry);
  }

  const pending = new Map<number, PendingInvite[]>();
  for (const row of pendingInvites) {
    if (row.businessId === null) continue;

    const list = pending.get(row.businessId) ?? [];
    list.push({ id: row.id, name: row.name, email: row.email, role: row.role });
    pending.set(row.businessId, list);
  }

  return businesses.map((business) => ({
    id: business.id,
    name: business.name,
    slug: business.slug,
    createdAt: business.createdAt.toISOString(),
    employees: counts.get(business.id)?.employees ?? 0,
    admins: counts.get(business.id)?.admins ?? 0,
    pendingInvites: pending.get(business.id) ?? [],
  }));
}

// Somar as linhas já montadas, em vez de agregar de novo no banco, garante que
// os cartões do topo nunca divirjam da tabela logo abaixo deles.
export function buildPlatformTotals(rows: BusinessRow[]): PlatformTotals {
  return {
    businesses: rows.length,
    employees: rows.reduce((sum, row) => sum + row.employees, 0),
    admins: rows.reduce((sum, row) => sum + row.admins, 0),
    pendingInvites: rows.reduce((sum, row) => sum + row.pendingInvites.length, 0),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/services/platformRules.test.ts && npm run typecheck`
Expected: 9 testes PASS, typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/platformRules.ts server/src/services/platformRules.test.ts
git commit -m "feat(server): add platform aggregation rules"
```

---

### Task 2: `GET /businesses`

**Files:**
- Modify: `server/src/repositories/businessRepository.ts` (adicionar `findAll`)
- Modify: `server/src/repositories/userRepository.ts` (adicionar `countByBusinessAndRole`, `findPendingInvites`)
- Modify: `server/src/services/businessService.ts` (adicionar `listBusinesses`)
- Modify: `server/src/controllers/businessController.ts` (adicionar `listBusinesses`)
- Modify: `server/src/routes/businessRoutes.ts` (registrar a rota)

**Interfaces:**
- Consumes: `buildBusinessRows`, `buildPlatformTotals`, `PlatformOverview` de `./platformRules` (Task 1).
- Produces: `GET /businesses` respondendo `PlatformOverview`. A Task 5 consome esse JSON.

Sem teste unitário: as três funções novas são acesso a dados, e o merge que carrega a lógica já está coberto pela Task 1. A verificação é a matriz de curl do Step 4.

- [ ] **Step 1: Adicionar os métodos de repositório**

Em `server/src/repositories/businessRepository.ts`, dentro de `businessRepository`, depois de `findById`:

```ts
  // Sem relações: as contagens vêm de queries próprias, para não puxar uma
  // linha de usuário por negócio.
  findAll() {
    return prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
  },
```

Em `server/src/repositories/userRepository.ts`, dentro de `userRepository`, adicionar no fim (antes do `}`):

```ts
  // groupBy em vez de _count por negócio: o Prisma aceita um único filtro por
  // relação em cada chave de _count, e aqui são dois recortes do mesmo `users`.
  countByBusinessAndRole() {
    return prisma.user.groupBy({
      by: ["businessId", "role"],
      where: { businessId: { not: null } },
      _count: { _all: true },
    });
  },

  // Lista e não contagem: o botão de reenvio precisa do id do convidado.
  // password null = convite ainda não aceito.
  findPendingInvites() {
    return prisma.user.findMany({
      where: { businessId: { not: null }, password: null },
      select: { id: true, name: true, email: true, role: true, businessId: true },
    });
  },
```

- [ ] **Step 2: Adicionar o service**

Em `server/src/services/businessService.ts`, acrescentar ao import block:

```ts
import {
  PlatformOverview,
  buildBusinessRows,
  buildPlatformTotals,
} from "./platformRules";
```

E dentro de `businessService`, antes de `createBusiness`:

```ts
  async listBusinesses(): Promise<PlatformOverview> {
    const [businesses, roleCounts, pendingInvites] = await Promise.all([
      businessRepository.findAll(),
      userRepository.countByBusinessAndRole(),
      userRepository.findPendingInvites(),
    ]);

    const rows = buildBusinessRows(businesses, roleCounts, pendingInvites);

    return { totals: buildPlatformTotals(rows), businesses: rows };
  },
```

- [ ] **Step 3: Adicionar controller e rota**

Em `server/src/controllers/businessController.ts`, adicionar no fim:

```ts
export async function listBusinesses(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  reply.send(await businessService.listBusinesses());
}
```

Em `server/src/routes/businessRoutes.ts`, trocar o import do controller por:

```ts
import {
  createBusiness,
  listBusinesses,
  CreateBusinessBody,
} from "../controllers/businessController";
```

E dentro de `businessRoutes`, antes do `app.post` existente:

```ts
  // Sem schema: a rota não recebe params, body nem querystring.
  app.get(
    "/businesses",
    { preHandler: [authenticate, authorize(Role.SUPERADMIN)] },
    listBusinesses,
  );
```

- [ ] **Step 4: Verificar end-to-end**

```bash
cd server && npm run typecheck && npm run db:seed
npm run dev   # deixar rodando em outro terminal
```

```bash
# 1. token do superadmin
SUPER=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@timeflow.com","password":"SuperAdmin123!"}' | jq -r .token)

# 2. a lista responde 200 com totals + businesses
curl -s localhost:3333/businesses -H "Authorization: Bearer $SUPER" | jq

# 3. sem token → 401
curl -s -o /dev/null -w '%{http_code}\n' localhost:3333/businesses

# 4. com token de ADMIN → 403 (usar o login de um admin já existente na base)
curl -s -o /dev/null -w '%{http_code}\n' localhost:3333/businesses \
  -H "Authorization: Bearer $ADMIN"
```

Expected: (2) JSON com `totals` e `businesses`, ordenado do mais recente para o mais antigo; (3) `401`; (4) `403`.

Conferir na saída de (2): o ADMIN órfão do seed (`convite-teste@timeflow.com`) **não** aparece em `pendingInvites` de negócio nenhum e não é contado em `totals.admins`.

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/businessRepository.ts \
        server/src/repositories/userRepository.ts \
        server/src/services/businessService.ts \
        server/src/controllers/businessController.ts \
        server/src/routes/businessRoutes.ts
git commit -m "feat(server): list platform businesses for superadmin"
```

---

### Task 3: `POST /businesses/:id/resend-invite`

**Files:**
- Modify: `server/src/repositories/userRepository.ts` (adicionar `findById`, `resetInviteToken`)
- Modify: `server/src/services/businessService.ts` (adicionar `resendInvite`)
- Modify: `server/src/controllers/businessController.ts` (adicionar `resendInvite`, `ResendInviteParams`, `ResendInviteBody`)
- Modify: `server/src/routes/businessRoutes.ts` (registrar a rota)

**Interfaces:**
- Consumes: `generateInviteToken` de `../lib/inviteToken`, `sendInviteEmail` e `sendEmployeeInviteEmail` de `../lib/inviteEmail`, `AppError`/`ConflictError`/`NotFoundError` de `../lib/errors`, `env` de `../config/env` — todos já usados por `businessService.ts` ou `employeeService.ts`.
- Produces: `POST /businesses/:id/resend-invite` com body `{ userId: number }`. A Task 7 consome.

- [ ] **Step 1: Adicionar os métodos de repositório**

Em `server/src/repositories/userRepository.ts`, dentro de `userRepository`:

```ts
  findById(id: number) {
    return prisma.user.findUnique({ where: { id } });
  },

  resetInviteToken(id: number, inviteToken: string, inviteTokenExpiresAt: Date) {
    return prisma.user.update({
      where: { id },
      data: { inviteToken, inviteTokenExpiresAt },
    });
  },
```

- [ ] **Step 2: Adicionar o service**

Em `server/src/services/businessService.ts`, ajustar os imports existentes para incluir o que falta:

```ts
import { Business, Role } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "../lib/errors";
import { sendEmployeeInviteEmail, sendInviteEmail } from "../lib/inviteEmail";
```

E dentro de `businessService`, depois de `createBusiness`:

```ts
  async resendInvite(businessId: number, userId: number): Promise<void> {
    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const user = await userRepository.findById(userId);
    if (!user || user.businessId !== businessId) {
      throw new NotFoundError("User not found");
    }

    if (user.password !== null) {
      throw new ConflictError("This invite has already been accepted");
    }

    const { token, expiresAt } = generateInviteToken();
    const inviteLink = `${env.webOrigin}/accept-invite?token=${token}`;

    // Envia ANTES de gravar. Na ordem inversa, uma falha de envio deixaria o
    // token antigo já sobrescrito: o link que o convidado tem morre e nenhum
    // novo chega, e o convite fica irrecuperável sem mexer no banco. Aqui, a
    // falha de envio deixa o estado intacto. O caso oposto — envio ok, escrita
    // falha — entrega um link morto, mas basta reenviar de novo.
    try {
      if (user.role === Role.EMPLOYEE) {
        await sendEmployeeInviteEmail({
          to: user.email,
          employeeName: user.name,
          businessName: business.name,
          inviteLink,
        });
      } else {
        await sendInviteEmail({
          to: user.email,
          adminName: user.name,
          businessName: business.name,
          inviteLink,
        });
      }
    } catch (error) {
      // Diferente de createBusiness, que engole a falha porque o negócio já
      // existe: aqui não há nada criado para preservar, e responder 200 sem ter
      // enviado seria mentir para quem clicou.
      console.error(`Failed to resend invite email to ${user.email}:`, error);
      throw new AppError("Could not send the invite email", 502);
    }

    await userRepository.resetInviteToken(user.id, token, expiresAt);
  },
```

- [ ] **Step 3: Adicionar controller e rota**

Em `server/src/controllers/businessController.ts`, adicionar no fim:

```ts
export interface ResendInviteParams {
  id: number;
}

export interface ResendInviteBody {
  userId: number;
}

export async function resendInvite(
  request: FastifyRequest<{ Params: ResendInviteParams; Body: ResendInviteBody }>,
  reply: FastifyReply,
): Promise<void> {
  await businessService.resendInvite(request.params.id, request.body.userId);

  reply.status(204).send();
}
```

Em `server/src/routes/businessRoutes.ts`, atualizar o import do controller:

```ts
import {
  createBusiness,
  listBusinesses,
  resendInvite,
  CreateBusinessBody,
  ResendInviteBody,
  ResendInviteParams,
} from "../controllers/businessController";
```

Adicionar o schema, ao lado de `createBusinessSchema`:

```ts
const resendInviteSchema = {
  params: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["userId"],
    additionalProperties: false,
    properties: {
      userId: { type: "integer" },
    },
  },
};
```

E a rota, no fim de `businessRoutes`:

```ts
  app.post<{ Params: ResendInviteParams; Body: ResendInviteBody }>(
    "/businesses/:id/resend-invite",
    {
      schema: resendInviteSchema,
      preHandler: [authenticate, authorize(Role.SUPERADMIN)],
    },
    resendInvite,
  );
```

- [ ] **Step 4: Verificar end-to-end**

```bash
cd server && npm run typecheck
npm run dev   # em outro terminal
```

```bash
SUPER=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@timeflow.com","password":"SuperAdmin123!"}' | jq -r .token)

# pegar um negócio e um convite pendente da lista
curl -s localhost:3333/businesses -H "Authorization: Bearer $SUPER" \
  | jq '.businesses[] | select(.pendingInvites | length > 0) | {id, pendingInvites}'

# 1. reenvio válido → 204, e o Ethereal loga a preview URL no console do servidor
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  localhost:3333/businesses/$BID/resend-invite \
  -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d "{\"userId\":$UID}"

# 2. userId de outro negócio → 404
curl -s -X POST localhost:3333/businesses/$BID/resend-invite \
  -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d '{"userId":999999}'

# 3. userId de quem já aceitou o convite → 409
curl -s -X POST localhost:3333/businesses/$BID/resend-invite \
  -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d "{\"userId\":$UID_ATIVO}"

# 4. campo extra no body → 400 (additionalProperties: false)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  localhost:3333/businesses/$BID/resend-invite \
  -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d "{\"userId\":$UID,\"role\":\"SUPERADMIN\"}"
```

Expected: (1) `204`; (2) `404` com `"User not found"`; (3) `409` com `"This invite has already been accepted"`; (4) `400`.

Depois de (1), reconsultar `GET /businesses` e confirmar que o convite continua em `pendingInvites` (o token mudou, o convite não foi aceito).

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/userRepository.ts \
        server/src/services/businessService.ts \
        server/src/controllers/businessController.ts \
        server/src/routes/businessRoutes.ts
git commit -m "feat(server): resend a pending invite from the superadmin panel"
```

---

### Task 4: Tipos e helpers do painel no front

**Files:**
- Create: `web/lib/platform.ts`
- Test: `web/lib/platform.test.ts`

**Interfaces:**
- Consumes: `Role` de `@/lib/auth`.
- Produces: `PendingInvite`, `BusinessRow`, `PlatformTotals`, `PlatformOverview`, `slugify(name: string): string`, `SLUG_PATTERN: RegExp`, `businessStatus(row: BusinessRow): "pending" | "active"`, `formatCreatedAt(iso: string): string`, `formatTeam(row: BusinessRow): string`. Tasks 5, 6 e 7 importam daqui.

Tipos e helpers moram no mesmo arquivo, seguindo `web/lib/dashboard.ts` — não em `web/lib/types.ts`, que guarda só as entidades cruas da API.

- [ ] **Step 1: Write the failing test**

Criar `web/lib/platform.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BusinessRow } from "./platform.ts";
import {
  SLUG_PATTERN,
  businessStatus,
  formatTeam,
  slugify,
} from "./platform.ts";

function row(overrides: Partial<BusinessRow> = {}): BusinessRow {
  return {
    id: 1,
    name: "Barbearia do Zé",
    slug: "barbearia-do-ze",
    createdAt: "2026-07-20T14:03:11.000Z",
    employees: 3,
    admins: 1,
    pendingInvites: [],
    ...overrides,
  };
}

test("slugify remove acento e baixa a caixa", () => {
  assert.equal(slugify("Barbearia do Zé"), "barbearia-do-ze");
  assert.equal(slugify("Salão Beleza & Cia"), "salao-beleza-cia");
});

test("slugify colapsa separadores repetidos num hífen só", () => {
  assert.equal(slugify("Studio   ---   Nova"), "studio-nova");
});

test("slugify não deixa hífen sobrando nas pontas", () => {
  assert.equal(slugify("  Ateliê!  "), "atelie");
  assert.equal(slugify("---"), "");
});

test("slugify de string vazia devolve string vazia, não quebra", () => {
  assert.equal(slugify(""), "");
});

// O que slugify produz tem que passar no mesmo regex que o schema da rota
// POST /businesses aplica no servidor.
test("o slug gerado satisfaz o padrão que a API exige", () => {
  for (const name of ["Barbearia do Zé", "Salão Beleza & Cia", "Studio 22"]) {
    assert.ok(SLUG_PATTERN.test(slugify(name)), name);
  }
});

test("negócio com convite pendente fica pendente; sem, fica ativo", () => {
  assert.equal(businessStatus(row()), "active");
  assert.equal(
    businessStatus(
      row({
        pendingInvites: [
          { id: 12, name: "Zé", email: "ze@x.com", role: "ADMIN" },
        ],
      }),
    ),
    "pending",
  );
});

test("formatTeam concorda o singular e o plural", () => {
  assert.equal(formatTeam(row({ employees: 3, admins: 1 })), "3 colaboradores · 1 admin");
  assert.equal(formatTeam(row({ employees: 1, admins: 2 })), "1 colaborador · 2 admins");
  assert.equal(formatTeam(row({ employees: 0, admins: 0 })), "0 colaboradores · 0 admins");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test lib/platform.test.ts`
Expected: FAIL — não consegue resolver `./platform.ts`.

- [ ] **Step 3: Write minimal implementation**

Criar `web/lib/platform.ts`:

```ts
import { Role } from "@/lib/auth";

export interface PendingInvite {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface BusinessRow {
  id: number;
  name: string;
  slug: string;
  createdAt: string; // ISO vindo da API
  employees: number;
  admins: number;
  pendingInvites: PendingInvite[];
}

export interface PlatformTotals {
  businesses: number;
  employees: number;
  admins: number;
  pendingInvites: number;
}

export interface PlatformOverview {
  totals: PlatformTotals;
  businesses: BusinessRow[];
}

// Mesmo formato que o schema de POST /businesses exige no servidor.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    // Tira os diacríticos que o NFD separou: "Zé" → "Ze". Escapes unicode em
    // vez dos caracteres combinantes literais, que são invisíveis no editor.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function businessStatus(row: BusinessRow): "pending" | "active" {
  return row.pendingInvites.length > 0 ? "pending" : "active";
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatCreatedAt(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatTeam(row: BusinessRow): string {
  const employees = row.employees === 1 ? "colaborador" : "colaboradores";
  const admins = row.admins === 1 ? "admin" : "admins";

  return `${row.employees} ${employees} · ${row.admins} ${admins}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && node --test lib/platform.test.ts && npm run typecheck`
Expected: 7 testes PASS, typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add web/lib/platform.ts web/lib/platform.test.ts
git commit -m "feat(web): add platform panel types and helpers"
```

---

### Task 5: Tela do painel — cartões e lista

**Files:**
- Create: `web/components/dashboard/platform-tiles.tsx`
- Create: `web/components/dashboard/business-table.tsx`
- Create: `web/components/dashboard/platform-overview.tsx`
- Modify: `web/app/dashboard/page.tsx` (branch de SUPERADMIN)

**Interfaces:**
- Consumes: `PlatformOverview`, `BusinessRow`, `businessStatus`, `formatCreatedAt`, `formatTeam` de `@/lib/platform` (Task 4); `GET /businesses` (Task 2).
- Produces: `<PlatformOverview />` sem props. `<PlatformTiles totals={...} />`. `<BusinessTable businesses={...} />`. A Task 6 adiciona um botão ao header de `PlatformOverview`; a Task 7 adiciona a coluna de ação a `BusinessTable`.

Sem teste automatizado: a lógica pura já está nas Tasks 1 e 4, e o projeto não tem infra de teste de componente React. A verificação é o Step 5, no navegador.

- [ ] **Step 1: Criar os cartões**

Criar `web/components/dashboard/platform-tiles.tsx`:

```tsx
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building03Icon,
  MailOpen01Icon,
  UserGroupIcon,
  UserShield01Icon,
} from "@hugeicons/core-free-icons";
import { PlatformTotals } from "@/lib/platform";
import { cn } from "@/lib/utils";

function Tile({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: typeof Building03Icon;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-sm",
        highlight && "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <HugeiconsIcon
          icon={icon}
          className={cn(
            "size-4 text-muted-foreground/60",
            highlight && "text-amber-600 dark:text-amber-500",
          )}
        />
      </div>
      <p
        className={cn(
          "mt-3 text-3xl leading-none font-semibold tracking-tight tabular-nums",
          highlight && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function PlatformTiles({ totals }: { totals: PlatformTotals }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile label="Negócios" value={totals.businesses} icon={Building03Icon} />
      <Tile label="Colaboradores" value={totals.employees} icon={UserGroupIcon} />
      <Tile label="Administradores" value={totals.admins} icon={UserShield01Icon} />
      {/* Único número acionável da tela: destaca quando há o que destravar. */}
      <Tile
        label="Convites pendentes"
        value={totals.pendingInvites}
        icon={MailOpen01Icon}
        highlight={totals.pendingInvites > 0}
      />
    </div>
  );
}
```

- [ ] **Step 2: Criar a lista de negócios**

Criar `web/components/dashboard/business-table.tsx`. Duas apresentações do mesmo dado: cards abaixo de `sm`, tabela a partir de `sm`.

```tsx
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BusinessRow,
  businessStatus,
  formatCreatedAt,
  formatTeam,
} from "@/lib/platform";

function StatusBadge({ row }: { row: BusinessRow }) {
  const pending = businessStatus(row) === "pending";

  return (
    <Badge variant={pending ? "outline" : "default"}>
      {pending ? "Convite pendente" : "Ativo"}
    </Badge>
  );
}

export function BusinessTable({ businesses }: { businesses: BusinessRow[] }) {
  return (
    <>
      {/* Abaixo de sm a tabela viraria scroll horizontal; cada negócio vira card. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {businesses.map((row) => (
          <div key={row.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.name}</p>
                <p className="truncate text-sm text-muted-foreground">/{row.slug}</p>
              </div>
              <StatusBadge row={row} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{formatTeam(row)}</p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Criado em {formatCreatedAt(row.createdAt)}
            </p>
          </div>
        ))}
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Negócio</TableHead>
              <TableHead>Equipe</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {businesses.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-muted-foreground">/{row.slug}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatTeam(row)}
                </TableCell>
                <TableCell>
                  <StatusBadge row={row} />
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatCreatedAt(row.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Criar o container com fetch e estados**

Criar `web/components/dashboard/platform-overview.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { BusinessTable } from "@/components/dashboard/business-table";
import { PlatformTiles } from "@/components/dashboard/platform-tiles";
import { PlatformOverview as PlatformOverviewData } from "@/lib/platform";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className ?? ""}`} />;
}

export function PlatformOverview() {
  const [data, setData] = useState<PlatformOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);

    return fetchAdapter<PlatformOverviewData>({
      method: "GET",
      path: "/businesses",
    })
      .then(({ data: overview }) => {
        setData(overview);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Plataforma</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Os negócios cadastrados no Time Flow.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium">{error}</p>
          <Button className="mt-4" size="sm" disabled={loading} onClick={load}>
            {loading ? "Tentando…" : "Tentar de novo"}
          </Button>
        </div>
      ) : null}

      {!error && !data ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : null}

      {data ? (
        <div className="mt-8">
          <PlatformTiles totals={data.totals} />

          <div className="mt-4">
            {data.businesses.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center">
                <p className="text-sm font-medium">Nenhum negócio cadastrado ainda</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cadastre o primeiro negócio para começar.
                </p>
              </div>
            ) : (
              <BusinessTable businesses={data.businesses} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Ligar no dashboard**

Em `web/app/dashboard/page.tsx`, adicionar ao bloco de imports:

```tsx
import { PlatformOverview } from "@/components/dashboard/platform-overview";
```

E logo abaixo de `const isAdmin = user.role === "ADMIN";` (linha 23), acrescentar:

```tsx
  const isSuperadmin = user.role === "SUPERADMIN";
```

Trocar a linha 73, que hoje é:

```tsx
  if (!isAdmin) return <PlaceholderOverview user={user} />;
```

por:

```tsx
  // O SUPERADMIN não tem businessId, então nada do dashboard de ocupação se
  // aplica a ele: vai para o painel da plataforma. PlaceholderOverview passa a
  // atender só EMPLOYEE.
  if (isSuperadmin) return <PlatformOverview />;
  if (!isAdmin) return <PlaceholderOverview user={user} />;
```

O `useEffect` da linha 69 já é gateado por `if (isAdmin)`, então não dispara para SUPERADMIN. Os hooks continuam todos acima dos `return`s, respeitando as regras dos hooks.

- [ ] **Step 5: Verificar no navegador**

```bash
cd web && npm run typecheck && npm run lint && npm run dev
```

Com o servidor rodando, logar como `superadmin@timeflow.com` / `SuperAdmin123!`:

- `/dashboard` mostra "Plataforma", os quatro cartões e a lista — não mais os três traços do `PlaceholderOverview`.
- O cartão "Convites pendentes" fica âmbar quando o número é maior que zero.
- Estreitar a janela abaixo de `sm` (< 640px): a tabela some e os cards empilhados aparecem, sem scroll horizontal na página.
- Derrubar a API e recarregar: aparece o bloco de erro com "Tentar de novo", e o botão recarrega quando a API volta.
- Logar como ADMIN: continua vendo o dashboard de ocupação de sempre, intacto.

- [ ] **Step 6: Commit**

```bash
git add web/components/dashboard/platform-tiles.tsx \
        web/components/dashboard/business-table.tsx \
        web/components/dashboard/platform-overview.tsx \
        web/app/dashboard/page.tsx
git commit -m "feat(web): show the platform panel to the superadmin"
```

---

### Task 6: Cadastrar negócio pelo painel

**Files:**
- Create: `web/components/dashboard/create-business-dialog.tsx`
- Modify: `web/components/dashboard/platform-overview.tsx` (botão no header + dialog)

**Interfaces:**
- Consumes: `slugify`, `SLUG_PATTERN` de `@/lib/platform` (Task 4); `POST /businesses` (já existe).
- Produces: `<CreateBusinessDialog open={boolean} onOpenChange={(open: boolean) => void} onCreated={() => void} />`.

- [ ] **Step 1: Criar o dialog**

Criar `web/components/dashboard/create-business-dialog.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SLUG_PATTERN, slugify } from "@/lib/platform";

// As mensagens de 409 do servidor são em inglês; o resto da UI é em português.
function translateError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erro inesperado.";

  if (error.message.includes("slug already exists")) {
    return "Já existe um negócio com esse endereço. Escolha outro.";
  }
  if (error.message.includes("email already exists")) {
    return "Já existe um usuário com esse e-mail.";
  }

  return error.message;
}

export function CreateBusinessDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Enquanto o dono não editar o slug à mão, ele acompanha o nome.
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setAdminName("");
    setAdminEmail("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!SLUG_PATTERN.test(slug)) {
      setError(
        "O endereço só aceita letras minúsculas, números e hífens — como barbearia-do-ze.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await fetchAdapter({
        method: "POST",
        path: "/businesses",
        body: { name, slug, admin: { name: adminName, email: adminEmail } },
      });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Novo negócio</DialogTitle>
            <DialogDescription>
              O administrador recebe um e-mail para definir a senha e assumir o
              negócio.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="business-name">Nome do negócio</FieldLabel>
              <Input
                id="business-name"
                value={name}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="Barbearia do Zé"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="business-slug">Endereço público</FieldLabel>
              <Input
                id="business-slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                placeholder="barbearia-do-ze"
                required
              />
              <p className="text-xs text-muted-foreground">
                Os clientes vão acessar em /{slug || "barbearia-do-ze"}
              </p>
            </Field>

            <Field>
              <FieldLabel htmlFor="admin-name">Nome do administrador</FieldLabel>
              <Input
                id="admin-name"
                value={adminName}
                onChange={(event) => setAdminName(event.target.value)}
                placeholder="José da Silva"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="admin-email">E-mail do administrador</FieldLabel>
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="jose@barbearia.com"
                required
              />
            </Field>

            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {submitting ? "Cadastrando…" : "Cadastrar negócio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Se a API de `Dialog`, `Field` ou `Spinner` divergir do usado aqui, alinhar com `web/app/dashboard/services/page.tsx`, que já usa os três — é a referência viva desses componentes no projeto.

- [ ] **Step 2: Ligar no painel**

Em `web/components/dashboard/platform-overview.tsx`, acrescentar aos imports:

```tsx
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { CreateBusinessDialog } from "@/components/dashboard/create-business-dialog";
```

Adicionar o estado, junto dos outros `useState`:

```tsx
  const [createOpen, setCreateOpen] = useState(false);
```

No header, substituir o `<div className="flex flex-wrap items-end justify-between gap-4">…</div>` inteiro por:

```tsx
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Plataforma</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Os negócios cadastrados no Time Flow.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          Novo negócio
        </Button>
      </div>

      <CreateBusinessDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />
```

No empty state, trocar o parágrafo "Cadastre o primeiro negócio para começar." por um CTA:

```tsx
                <p className="mt-1 text-sm text-muted-foreground">
                  Cadastre o primeiro negócio para começar.
                </p>
                <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                  Cadastrar negócio
                </Button>
```

- [ ] **Step 3: Verificar no navegador**

```bash
cd web && npm run typecheck && npm run lint && npm run dev
```

Logado como superadmin:

- "Novo negócio" abre o dialog; digitar "Barbearia do Zé" preenche o endereço com `barbearia-do-ze` sozinho.
- Editar o endereço à mão e depois mudar o nome: o endereço editado **não** é sobrescrito.
- Digitar um endereço inválido (`Barbearia Zé`) e enviar: erro em português, sem chamar a API.
- Cadastrar com sucesso: o dialog fecha, a lista recarrega e o negócio novo aparece no topo, com badge "Convite pendente".
- Cadastrar de novo com o mesmo endereço: "Já existe um negócio com esse endereço."
- Cadastrar com um e-mail já usado: "Já existe um usuário com esse e-mail."
- Conferir no console do servidor a preview URL do Ethereal com o convite.

- [ ] **Step 4: Commit**

```bash
git add web/components/dashboard/create-business-dialog.tsx \
        web/components/dashboard/platform-overview.tsx
git commit -m "feat(web): register a business from the superadmin panel"
```

---

### Task 7: Reenviar convite pela lista

**Files:**
- Modify: `web/components/dashboard/business-table.tsx` (coluna/ação de reenvio)
- Modify: `web/components/dashboard/platform-overview.tsx` (handler + feedback)

**Interfaces:**
- Consumes: `POST /businesses/:id/resend-invite` (Task 3); `BusinessRow`, `businessStatus` de `@/lib/platform`.
- Produces: `BusinessTable` passa a receber `onResend: (row: BusinessRow) => void`, `resendingId: number | null` e `resentId: number | null`.

- [ ] **Step 1: Adicionar a ação à lista**

Em `web/components/dashboard/business-table.tsx`, **acrescentar** aos imports existentes — sem remover os de `@/lib/platform`, `@/components/ui/badge` e `@/components/ui/table`, que a Task 5 já colocou e continuam em uso:

```tsx
import { HugeiconsIcon } from "@hugeicons/react";
import { Mail01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
```

Ao final deste step o arquivo deve importar, ao todo: `HugeiconsIcon`, `Mail01Icon`, `Badge`, `Button`, `Spinner`, os seis símbolos de `@/components/ui/table`, e `BusinessRow` + `businessStatus` + `formatCreatedAt` + `formatTeam` de `@/lib/platform`.

Adicionar, acima de `BusinessTable`, o botão compartilhado pelas duas apresentações:

```tsx
function ResendButton({
  row,
  onResend,
  resending,
  resent,
}: {
  row: BusinessRow;
  onResend: (row: BusinessRow) => void;
  resending: boolean;
  resent: boolean;
}) {
  // Nada a reenviar num negócio cujo admin já assumiu.
  if (businessStatus(row) === "active") return null;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={resending || resent}
      onClick={() => onResend(row)}
    >
      {resending ? <Spinner /> : <HugeiconsIcon icon={Mail01Icon} data-icon="inline-start" />}
      {resent ? "Convite enviado" : resending ? "Enviando…" : "Reenviar convite"}
    </Button>
  );
}
```

Trocar a assinatura de `BusinessTable`:

```tsx
export function BusinessTable({
  businesses,
  onResend,
  resendingId,
  resentId,
}: {
  businesses: BusinessRow[];
  onResend: (row: BusinessRow) => void;
  resendingId: number | null;
  resentId: number | null;
}) {
```

No card mobile, depois do `<p>Criado em …</p>`:

```tsx
            <div className="mt-3 empty:mt-0">
              <ResendButton
                row={row}
                onResend={onResend}
                resending={resendingId === row.id}
                resent={resentId === row.id}
              />
            </div>
```

Na tabela, adicionar a coluna no `TableHeader`, depois de "Criado em":

```tsx
              <TableHead className="text-right">Ação</TableHead>
```

E a célula no `TableRow`, depois da célula de data:

```tsx
                <TableCell className="text-right">
                  <ResendButton
                    row={row}
                    onResend={onResend}
                    resending={resendingId === row.id}
                    resent={resentId === row.id}
                  />
                </TableCell>
```

- [ ] **Step 2: Adicionar o handler no painel**

Em `web/components/dashboard/platform-overview.tsx`, importar o tipo da linha:

```tsx
import {
  BusinessRow,
  PlatformOverview as PlatformOverviewData,
} from "@/lib/platform";
```

Adicionar o estado:

```tsx
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [resentId, setResentId] = useState<number | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
```

E o handler, depois de `load`:

```tsx
  // A lista não é recarregada no sucesso: o convite continua pendente (só o
  // token mudou), então o único efeito visível é a confirmação no próprio botão.
  const handleResend = useCallback(async (row: BusinessRow) => {
    const invite = row.pendingInvites[0];
    if (!invite) return;

    setResendingId(row.id);
    setResendError(null);
    try {
      await fetchAdapter({
        method: "POST",
        path: `/businesses/${row.id}/resend-invite`,
        body: { userId: invite.id },
      });
      setResentId(row.id);
    } catch (err) {
      setResendError(
        err instanceof ApiError
          ? `Não foi possível reenviar o convite de ${row.name}.`
          : "Erro inesperado.",
      );
    } finally {
      setResendingId(null);
    }
  }, []);
```

Passar tudo para a tabela:

```tsx
              <BusinessTable
                businesses={data.businesses}
                onResend={handleResend}
                resendingId={resendingId}
                resentId={resentId}
              />
```

E mostrar o erro de reenvio acima da lista, logo depois de `<PlatformTiles … />`:

```tsx
          {resendError ? (
            <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {resendError}
            </p>
          ) : null}
```

- [ ] **Step 3: Verificar no navegador**

```bash
cd web && npm run typecheck && npm run lint && npm run dev
```

Logado como superadmin, com um negócio de convite pendente na lista:

- Só as linhas com badge "Convite pendente" mostram o botão; as "Ativo" não mostram nada.
- Clicar em "Reenviar convite": vira "Enviando…" com spinner, depois "Convite enviado" e fica desabilitado.
- Conferir no console do servidor a nova preview URL do Ethereal, e que o link novo abre `/accept-invite` e permite definir a senha.
- Abrir o link **antigo** (da criação do negócio): deve falhar, porque o token foi rotacionado.
- Derrubar a API e clicar em reenviar: aparece a faixa vermelha "Não foi possível reenviar o convite de …", e a lista continua na tela.
- Estreitar abaixo de `sm`: o botão aparece dentro do card, com a mesma sequência de estados.

- [ ] **Step 4: Rodar a suíte inteira**

```bash
cd server && npm test && npm run typecheck
cd ../web && npm test && npm run typecheck && npm run lint
```

Expected: tudo verde. Nenhum teste existente quebrado.

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/business-table.tsx \
        web/components/dashboard/platform-overview.tsx
git commit -m "feat(web): resend a pending invite from the business list"
```

---

## Dívidas deixadas de propósito

Registradas aqui para não parecerem esquecimento na revisão:

- **Dialogs não bloqueiam dismiss com request em voo.** `CreateBusinessDialog` herda o comportamento de services/team/schedule. É item do ticket de hardening e vale igualmente para as três telas existentes; consertar só na nova criaria inconsistência.
- **`serviceParamsSchema` não tem `additionalProperties: false`.** O schema novo desta entrega tem. Alinhar o antigo é fora de escopo.
- **`resentId` guarda um único id.** Reenviar para o negócio B limpa a confirmação visual do negócio A. Aceitável: a confirmação é efêmera e o volume de reenvios simultâneos é zero.
