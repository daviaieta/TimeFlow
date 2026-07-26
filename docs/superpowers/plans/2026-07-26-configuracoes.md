# Tela de configurações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a qualquer usuário logado uma tela para mudar nome, e-mail e senha, e ao ADMIN os dados do próprio negócio — nome, slug público e endereço.

**Architecture:** Três endpoints novos (`PUT /auth/me`, `PUT /auth/me/password`, `PUT /businesses/:id`), com a regra de "quando exigir a senha atual" isolada num módulo puro testável. Uma coluna `address` nullable entra no `Business`. No front, o contexto de autenticação do dashboard passa a expor um `refresh()` para que salvar o nome atualize a sidebar sem F5, e a tela vive em `/dashboard/settings` com três cartões independentes.

**Tech Stack:** Fastify 5 · Prisma 6.1 (PostgreSQL) · bcrypt · Next.js 16 · React 19 · shadcn-over-Base-UI · testes `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-26-configuracoes-design.md`

**Branch:** `feat/business-settings`, saindo de `feat/superadmin-panel` — os arquivos de business já carregam o painel do superadmin.

## Global Constraints

- Todo schema JSON de rota Fastify novo inclui `additionalProperties: false`.
- Camadas: `routes` → `controller` (fino, zero lógica) → `service` → `repository`. Regra de negócio pura vai em módulo que não importa Prisma.
- Mensagens de erro do servidor em inglês (como `server/src/lib/errors.ts`); tradução é do front.
- UI em português. Comentários em português explicando o PORQUÊ.
- Toda tela nova nasce mobile-first; a página nunca rola horizontalmente.
- `AppError(message, statusCode)`, `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409) já existem em `server/src/lib/errors.ts`.
- Servidor: `cd server && npm test` (baseline 88/88) e `npm run typecheck`.
- Web: `cd web && npm test` (baseline 62/62), `npm run typecheck`, `npm run lint`, `npm run build`.
- **Lint:** `npm run lint` no web tem DOIS problemas PRÉ-EXISTENTES que não são desta branch — um erro em `web/app/landing-header.tsx:19` e um aviso em `web/app/dashboard/layout.tsx`. A barra é: nenhum problema NOVO nos arquivos tocados.
- Credenciais de dev: `superadmin@timeflow.com` / `SuperAdmin123!` (SUPERADMIN, sem business). `ana@teste.com` / `Admin123!` (ADMIN, businessId=2, convite aceito).

---

### Task 1: Regras puras da conta

**Files:**
- Create: `server/src/services/accountRules.ts`
- Test: `server/src/services/accountRules.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `normalizeEmail(raw: string): string`, `requiresCurrentPassword(currentEmail: string, nextEmail: string): boolean`. A Task 3 importa os dois.

- [ ] **Step 1: Write the failing test**

Criar `server/src/services/accountRules.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEmail, requiresCurrentPassword } from "./accountRules";

test("normalizeEmail apara espaços e baixa a caixa", () => {
  assert.equal(normalizeEmail("  Jose@X.com "), "jose@x.com");
  assert.equal(normalizeEmail("JOSE@X.COM"), "jose@x.com");
  assert.equal(normalizeEmail("jose@x.com"), "jose@x.com");
});

test("normalizeEmail de string vazia não quebra", () => {
  assert.equal(normalizeEmail(""), "");
  assert.equal(normalizeEmail("   "), "");
});

test("e-mail diferente exige a senha atual", () => {
  assert.equal(requiresCurrentPassword("jose@x.com", "maria@x.com"), true);
});

test("mesmo e-mail não exige senha", () => {
  assert.equal(requiresCurrentPassword("jose@x.com", "jose@x.com"), false);
});

// Os dois chegam normalizados, então reenviar o mesmo endereço com outra caixa
// ou com espaços não é uma troca e não pode pedir senha à toa.
test("caixa e espaços não contam como troca depois de normalizar", () => {
  const current = normalizeEmail("Jose@X.com");
  const next = normalizeEmail("  jose@x.com  ");

  assert.equal(requiresCurrentPassword(current, next), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/services/accountRules.test.ts`
Expected: FAIL — `Cannot find module './accountRules'`.

- [ ] **Step 3: Write minimal implementation**

Criar `server/src/services/accountRules.ts`:

```ts
// Espaço e caixa não distinguem endereços de e-mail na prática, mas o @unique
// do Postgres compara byte a byte. Normalizar antes de comparar e de gravar
// impede que esta tela crie duas contas que o usuário leria como a mesma.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Trocar o e-mail é mexer no identificador de login, então exige confirmar a
// senha. Trocar só o nome é dado de exibição e não paga esse pedágio.
// Recebe os dois já normalizados: reenviar " Jose@X.com " contra um
// "jose@x.com" gravado não é uma troca.
export function requiresCurrentPassword(
  currentEmail: string,
  nextEmail: string,
): boolean {
  return currentEmail !== nextEmail;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/services/accountRules.test.ts && npm run typecheck`
Expected: 5 testes PASS, typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/accountRules.ts server/src/services/accountRules.test.ts
git commit -m "feat(server): add account rules for email normalisation"
```

---

### Task 2: Coluna `address` até o cliente

**Files:**
- Modify: `server/prisma/schema.prisma` (model `Business`)
- Create: `server/prisma/migrations/<timestamp>_add_address_to_business/migration.sql` (gerada)
- Modify: `server/src/repositories/userRepository.ts` (`findByIdWithBusiness`)
- Modify: `web/lib/auth.ts` (tipo `AuthUser`)

**Interfaces:**
- Consumes: nada.
- Produces: `Business.address: string | null` no Prisma; `GET /auth/me` devolve `user.business.address`; `AuthUser["business"]` ganha `address: string | null`. As Tasks 5 e 7 dependem disso.

- [ ] **Step 1: Alterar o schema**

Em `server/prisma/schema.prisma`, no model `Business`, acrescentar `address` logo depois de `slug`:

```prisma
model Business {
  id        Int      @id @default(autoincrement())
  name      String
  slug      String   @unique
  address   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users    User[]
  services Service[]
}
```

Nullable de propósito: todo negócio já cadastrado nasce sem endereço, e nem todo negócio tem ponto físico.

- [ ] **Step 2: Gerar e aplicar a migration**

```bash
cd server && npx prisma migrate dev --name add_address_to_business
```

Expected: cria `server/prisma/migrations/<timestamp>_add_address_to_business/migration.sql` contendo um `ALTER TABLE "Business" ADD COLUMN "address" TEXT;`, aplica no banco e regenera o client. Conferir o SQL gerado: se ele contiver qualquer `DROP`, PARE e reporte — uma coluna nullable nova nunca exige drop.

- [ ] **Step 3: Expor no `/auth/me`**

Em `server/src/repositories/userRepository.ts`, dentro de `findByIdWithBusiness`, adicionar `address` ao select do business:

```ts
        business: {
          select: { id: true, name: true, slug: true, address: true },
        },
```

- [ ] **Step 4: Alargar o tipo no front**

Em `web/lib/auth.ts`, na interface `AuthUser`:

```ts
  business: {
    id: number;
    name: string;
    slug: string;
    address: string | null;
  } | null;
```

- [ ] **Step 5: Verificar**

```bash
cd server && npm run typecheck && npm test
npm run dev   # em outro terminal, deixar rodando
```

```bash
T=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@teste.com","password":"Admin123!"}' | jq -r .token)
curl -s localhost:3333/auth/me -H "Authorization: Bearer $T" | jq .user.business
```

Expected: o objeto do business inclui `"address": null`.

```bash
cd web && npm run typecheck
```

Expected: limpo.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/src/repositories/userRepository.ts web/lib/auth.ts
git commit -m "feat(server): add an address column to the business"
```

---

### Task 3: `PUT /auth/me`

**Files:**
- Modify: `server/src/repositories/userRepository.ts` (adicionar `updateProfile`)
- Create: `server/src/services/accountService.ts`
- Modify: `server/src/controllers/authController.ts` (adicionar `updateMe`, `UpdateMeBody`)
- Modify: `server/src/routes/authRoutes.ts` (registrar a rota)

**Interfaces:**
- Consumes: `normalizeEmail`, `requiresCurrentPassword` de `./accountRules` (Task 1); `address` já no select (Task 2).
- Produces: `PUT /auth/me` respondendo `{ user }` no mesmo formato de `GET /auth/me`. `accountService.updateProfile(userId, input)`. A Task 7 consome o endpoint.

Sem teste unitário: a regra que carrega a decisão foi testada na Task 1; o resto é orquestração de I/O. A verificação é o Step 5.

- [ ] **Step 1: Adicionar o método de repositório**

Em `server/src/repositories/userRepository.ts`, dentro de `userRepository`:

```ts
  updateProfile(id: number, data: { name: string; email: string }) {
    return prisma.user.update({ where: { id }, data });
  },
```

- [ ] **Step 2: Criar o service**

Criar `server/src/services/accountService.ts`:

```ts
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors";
import { comparePassword } from "../lib/password";
import { userRepository } from "../repositories/userRepository";
import { normalizeEmail, requiresCurrentPassword } from "./accountRules";

interface UpdateProfileInput {
  name: string;
  email: string;
  currentPassword?: string;
}

export const accountService = {
  async updateProfile(userId: number, input: UpdateProfileInput) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const nextEmail = normalizeEmail(input.email);

    // Só a troca de e-mail paga o pedágio da senha: nome é dado de exibição.
    if (requiresCurrentPassword(normalizeEmail(user.email), nextEmail)) {
      if (!input.currentPassword) {
        throw new BadRequestError("Current password is required to change the email");
      }

      // Convite ainda não aceito não tem senha para conferir — não há como
      // provar identidade, então a troca não passa.
      if (
        !user.password ||
        !(await comparePassword(input.currentPassword, user.password))
      ) {
        throw new UnauthorizedError("Invalid credentials");
      }

      const taken = await userRepository.findByEmail(nextEmail);
      if (taken && taken.id !== userId) {
        throw new ConflictError("A user with this email already exists");
      }
    }

    await userRepository.updateProfile(userId, {
      name: input.name,
      email: nextEmail,
    });

    // Devolve o mesmo shape de GET /auth/me para o cliente atualizar o
    // contexto sem uma segunda ida ao servidor.
    return userRepository.findByIdWithBusiness(userId);
  },
};
```

- [ ] **Step 3: Adicionar controller e rota**

Em `server/src/controllers/authController.ts`, adicionar no fim:

```ts
export interface UpdateMeBody {
  name: string;
  email: string;
  currentPassword?: string;
}

export async function updateMe(
  request: FastifyRequest<{ Body: UpdateMeBody }>,
  reply: FastifyReply,
): Promise<void> {
  const user = await accountService.updateProfile(request.user.sub, request.body);

  reply.send({ user });
}
```

E acrescentar ao topo do arquivo:

```ts
import { accountService } from "../services/accountService";
```

Em `server/src/routes/authRoutes.ts`, atualizar o import do controller para incluir `updateMe` e `UpdateMeBody`, adicionar o schema ao lado dos existentes:

```ts
const updateMeSchema = {
  body: {
    type: "object",
    required: ["name", "email"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      email: { type: "string", format: "email" },
      // Opcional aqui de propósito: só é exigido quando o e-mail muda, e JSON
      // Schema não expressa "obrigatório se divergir do estado atual".
      currentPassword: { type: "string", minLength: 1 },
    },
  },
};
```

E registrar a rota dentro de `authRoutes`:

```ts
  app.put<{ Body: UpdateMeBody }>(
    "/auth/me",
    { schema: updateMeSchema, preHandler: [authenticate] },
    updateMe,
  );
```

- [ ] **Step 4: Verificar end-to-end**

```bash
cd server && npm run typecheck && npm test
npm run dev   # em outro terminal
```

```bash
T=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@teste.com","password":"Admin123!"}' | jq -r .token)

# 1. só o nome, sem senha → 200
curl -s -X PUT localhost:3333/auth/me -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana Paula","email":"ana@teste.com"}' | jq .user.name

# 2. e-mail novo sem currentPassword → 400
curl -s -X PUT localhost:3333/auth/me -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana Paula","email":"ana2@teste.com"}'

# 3. e-mail novo com senha ERRADA → 401
curl -s -X PUT localhost:3333/auth/me -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana Paula","email":"ana2@teste.com","currentPassword":"errada"}'

# 4. e-mail já usado por outro (usar o do superadmin) → 409
curl -s -X PUT localhost:3333/auth/me -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana Paula","email":"superadmin@timeflow.com","currentPassword":"Admin123!"}'

# 5. mesmo e-mail com caixa e espaços diferentes, SEM senha → 200
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3333/auth/me \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"name":"Ana Paula","email":"  ANA@teste.com  "}'

# 6. troca real de e-mail com senha certa → 200, e o login novo funciona
curl -s -X PUT localhost:3333/auth/me -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana Paula","email":"ana2@teste.com","currentPassword":"Admin123!"}' | jq .user.email
curl -s -o /dev/null -w '%{http_code}\n' localhost:3333/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ana2@teste.com","password":"Admin123!"}'
```

Expected: (1) `"Ana Paula"`; (2) `400` com "Current password is required to change the email"; (3) `401`; (4) `409`; (5) `200` — este é o teste da normalização, reenviar o mesmo endereço com outra caixa NÃO pode pedir senha; (6) `"ana2@teste.com"` e o login devolve `200`.

Depois de (6), devolver o e-mail ao original para não sujar a base:

```bash
T2=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ana2@teste.com","password":"Admin123!"}' | jq -r .token)
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3333/auth/me \
  -H "Authorization: Bearer $T2" -H 'Content-Type: application/json' \
  -d '{"name":"Ana","email":"ana@teste.com","currentPassword":"Admin123!"}'
```

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/userRepository.ts server/src/services/accountService.ts \
        server/src/controllers/authController.ts server/src/routes/authRoutes.ts
git commit -m "feat(server): let a user update their own name and email"
```

---

### Task 4: `PUT /auth/me/password`

**Files:**
- Modify: `server/src/repositories/userRepository.ts` (adicionar `updatePassword`)
- Modify: `server/src/services/accountService.ts` (adicionar `changePassword`)
- Modify: `server/src/controllers/authController.ts` (adicionar `changePassword`, `ChangePasswordBody`)
- Modify: `server/src/routes/authRoutes.ts` (registrar a rota)

**Interfaces:**
- Consumes: `comparePassword` e `hashPassword` de `../lib/password`; `accountService` (Task 3).
- Produces: `PUT /auth/me/password` respondendo 204. A Task 7 consome.

- [ ] **Step 1: Adicionar o método de repositório**

Em `server/src/repositories/userRepository.ts`, dentro de `userRepository`:

```ts
  updatePassword(id: number, password: string) {
    return prisma.user.update({ where: { id }, data: { password } });
  },
```

- [ ] **Step 2: Adicionar ao service**

Em `server/src/services/accountService.ts`, ajustar o import de password para incluir o hash:

```ts
import { comparePassword, hashPassword } from "../lib/password";
```

E dentro de `accountService`, depois de `updateProfile`:

```ts
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Sem senha gravada o convite nunca foi aceito: não há o que conferir, e
    // deixar passar seria uma porta para definir senha sem o token do convite.
    if (
      !user.password ||
      !(await comparePassword(currentPassword, user.password))
    ) {
      throw new UnauthorizedError("Invalid credentials");
    }

    await userRepository.updatePassword(userId, await hashPassword(newPassword));
  },
```

- [ ] **Step 3: Adicionar controller e rota**

Em `server/src/controllers/authController.ts`, no fim:

```ts
export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(
  request: FastifyRequest<{ Body: ChangePasswordBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { currentPassword, newPassword } = request.body;

  await accountService.changePassword(request.user.sub, currentPassword, newPassword);

  reply.status(204).send();
}
```

Em `server/src/routes/authRoutes.ts`, incluir `changePassword` e `ChangePasswordBody` no import do controller, adicionar o schema:

```ts
const changePasswordSchema = {
  body: {
    type: "object",
    required: ["currentPassword", "newPassword"],
    additionalProperties: false,
    properties: {
      currentPassword: { type: "string", minLength: 1 },
      // Mesmo mínimo do accept-invite: o convite e a troca não podem divergir.
      newPassword: { type: "string", minLength: 8 },
    },
  },
};
```

E a rota:

```ts
  app.put<{ Body: ChangePasswordBody }>(
    "/auth/me/password",
    { schema: changePasswordSchema, preHandler: [authenticate] },
    changePassword,
  );
```

- [ ] **Step 4: Verificar end-to-end**

```bash
cd server && npm run typecheck && npm test
npm run dev   # em outro terminal
```

```bash
T=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@teste.com","password":"Admin123!"}' | jq -r .token)

# 1. senha atual errada → 401
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3333/auth/me/password \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"errada","newPassword":"NovaSenha123!"}'

# 2. nova senha curta demais → 400 (schema)
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3333/auth/me/password \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"Admin123!","newPassword":"curta"}'

# 3. troca válida → 204
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3333/auth/me/password \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"Admin123!","newPassword":"NovaSenha123!"}'

# 4. a senha antiga não entra mais, a nova entra
curl -s -o /dev/null -w 'antiga: %{http_code}\n' localhost:3333/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"ana@teste.com","password":"Admin123!"}'
curl -s -o /dev/null -w 'nova:   %{http_code}\n' localhost:3333/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"ana@teste.com","password":"NovaSenha123!"}'

# 5. o token de ANTES da troca continua valendo (comportamento documentado)
curl -s -o /dev/null -w 'token velho: %{http_code}\n' localhost:3333/auth/me \
  -H "Authorization: Bearer $T"
```

Expected: (1) `401`; (2) `400`; (3) `204`; (4) antiga `401`, nova `200`; (5) `200` — o JWT não deriva da senha, e a spec documenta isso como escolha.

Devolver a senha ao original para as tasks seguintes:

```bash
T3=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@teste.com","password":"NovaSenha123!"}' | jq -r .token)
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3333/auth/me/password \
  -H "Authorization: Bearer $T3" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"NovaSenha123!","newPassword":"Admin123!"}'
```

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/userRepository.ts server/src/services/accountService.ts \
        server/src/controllers/authController.ts server/src/routes/authRoutes.ts
git commit -m "feat(server): let a user change their own password"
```

---

### Task 5: `PUT /businesses/:id`

**Files:**
- Modify: `server/src/repositories/businessRepository.ts` (adicionar `update`)
- Modify: `server/src/services/businessService.ts` (adicionar `updateBusiness`)
- Modify: `server/src/controllers/businessController.ts` (adicionar `updateBusiness`, `UpdateBusinessParams`, `UpdateBusinessBody`)
- Modify: `server/src/routes/businessRoutes.ts` (registrar a rota)

**Interfaces:**
- Consumes: `address` no schema (Task 2); `ForbiddenError`, `ConflictError`, `NotFoundError` de `../lib/errors`.
- Produces: `PUT /businesses/:id` respondendo `{ business }`. A Task 7 consome.

**O ponto mais sensível desta entrega.** O `:id` vem da URL e o guard é o que impede um ADMIN de editar o negócio do vizinho.

- [ ] **Step 1: Adicionar o método de repositório**

Em `server/src/repositories/businessRepository.ts`, dentro de `businessRepository`:

```ts
  update(id: number, data: { name: string; slug: string; address: string | null }) {
    return prisma.business.update({
      where: { id },
      // Campos explícitos, nunca o objeto do request inteiro: é o que impede
      // mass-assignment de colunas que o schema da rota não previu.
      data: { name: data.name, slug: data.slug, address: data.address },
    });
  },
```

- [ ] **Step 2: Adicionar ao service**

Em `server/src/services/businessService.ts`, garantir que `ForbiddenError` está no import de erros, e adicionar dentro de `businessService`:

```ts
  async updateBusiness(
    businessId: number,
    userBusinessId: number | null,
    input: { name: string; slug: string; address: string | null },
  ) {
    // Antes de qualquer leitura do alvo: responder 404 para um id que existe
    // mas não é seu vazaria a existência de outros negócios.
    if (userBusinessId === null || businessId !== userBusinessId) {
      throw new ForbiddenError("You do not have permission to edit this business");
    }

    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const slugOwner = await businessRepository.findBySlug(input.slug);
    if (slugOwner && slugOwner.id !== businessId) {
      throw new ConflictError("A business with this slug already exists");
    }

    return businessRepository.update(businessId, input);
  },
```

- [ ] **Step 3: Adicionar controller e rota**

Em `server/src/controllers/businessController.ts`, no fim:

```ts
export interface UpdateBusinessParams {
  id: number;
}

export interface UpdateBusinessBody {
  name: string;
  slug: string;
  address: string | null;
}

export async function updateBusiness(
  request: FastifyRequest<{ Params: UpdateBusinessParams; Body: UpdateBusinessBody }>,
  reply: FastifyReply,
): Promise<void> {
  const business = await businessService.updateBusiness(
    request.params.id,
    request.user.businessId,
    request.body,
  );

  reply.send({ business });
}
```

Em `server/src/routes/businessRoutes.ts`, incluir `updateBusiness`, `UpdateBusinessBody` e `UpdateBusinessParams` no import do controller, adicionar o schema:

```ts
const updateBusinessSchema = {
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
    required: ["name", "slug", "address"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      slug: { type: "string", minLength: 1, pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
      // Aceita null para limpar o endereço; string vazia vira null no cliente.
      address: { type: ["string", "null"] },
    },
  },
};
```

E a rota, no fim de `businessRoutes`:

```ts
  app.put<{ Params: UpdateBusinessParams; Body: UpdateBusinessBody }>(
    "/businesses/:id",
    {
      schema: updateBusinessSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    updateBusiness,
  );
```

- [ ] **Step 4: Verificar end-to-end, com atenção ao 403**

```bash
cd server && npm run typecheck && npm test
npm run dev   # em outro terminal
```

```bash
A=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@teste.com","password":"Admin123!"}' | jq -r .token)
S=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@timeflow.com","password":"SuperAdmin123!"}' | jq -r .token)

# businessId da Ana (deve ser 2) e um id de OUTRO negócio
curl -s localhost:3333/auth/me -H "Authorization: Bearer $A" | jq .user.business.id
OUTRO=$(curl -s localhost:3333/businesses -H "Authorization: Bearer $S" \
  | jq '[.businesses[].id] - [2] | .[0]')
echo "outro negócio: $OUTRO"

# 1. editar o PRÓPRIO negócio → 200
curl -s -X PUT localhost:3333/businesses/2 -H "Authorization: Bearer $A" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Barbearia da Ana","slug":"barbearia-da-ana","address":"Rua X, 123"}' | jq .business

# 2. ADMIN tentando editar o negócio de OUTRO → 403. NÃO PODE PASSAR.
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3333/businesses/$OUTRO \
  -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d '{"name":"Invadido","slug":"invadido","address":null}'
# conferir que o alvo NÃO mudou:
curl -s localhost:3333/businesses -H "Authorization: Bearer $S" \
  | jq --argjson id "$OUTRO" '.businesses[] | select(.id==$id) | {id,name,slug}'

# 3. slug de outro negócio → 409 (slug derivado da lista, não fixo)
SLUG_ALHEIO=$(curl -s localhost:3333/businesses -H "Authorization: Bearer $S" \
  | jq -r '[.businesses[] | select(.id != 2) | .slug][0]')
echo "slug alheio: $SLUG_ALHEIO"
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3333/businesses/2 \
  -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Barbearia da Ana\",\"slug\":\"$SLUG_ALHEIO\",\"address\":null}"

# 4. slug malformado → 400 (schema)
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3333/businesses/2 \
  -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d '{"name":"X","slug":"Slug Invalido","address":null}'

# 5. SUPERADMIN (businessId null) → 403 pelo authorize(ADMIN)
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3333/businesses/2 \
  -H "Authorization: Bearer $S" -H 'Content-Type: application/json' \
  -d '{"name":"X","slug":"x","address":null}'

# 6. limpar o endereço com null → 200 e address null
curl -s -X PUT localhost:3333/businesses/2 -H "Authorization: Bearer $A" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Barbearia da Ana","slug":"barbearia-da-ana","address":null}' | jq .business.address
```

Expected: (1) o business atualizado com o endereço; (2) **`403`, e o negócio alvo inalterado** — se isso devolver 200 ou 404, PARE e reporte, é vazamento entre tenants; (3) `409`; (4) `400`; (5) `403`; (6) `null`.

O passo (5) exercita o mesmo `authorize(Role.ADMIN)` que rejeitaria um EMPLOYEE — a whitelist não distingue os dois papéis, então não é preciso criar um funcionário só para isso.

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/businessRepository.ts server/src/services/businessService.ts \
        server/src/controllers/businessController.ts server/src/routes/businessRoutes.ts
git commit -m "feat(server): let an admin update their own business"
```

---

### Task 6: Contexto recarregável e item de menu

**Files:**
- Modify: `web/app/dashboard/auth-context.tsx`
- Modify: `web/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `AuthUser` de `@/lib/auth`.
- Produces: `useAuthUser(): AuthUser` (assinatura inalterada) e `useRefreshAuthUser(): () => Promise<void>`. A Task 7 usa os dois.

Nenhuma tela nova aqui: o entregável é que o contexto passe a poder recarregar e que o menu tenha o item, sem quebrar nada do que já existe.

- [ ] **Step 1: Alargar o contexto**

Substituir o conteúdo de `web/app/dashboard/auth-context.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";
import { AuthUser } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser;
  refresh: () => Promise<void>;
}

const AuthUserContext = createContext<AuthContextValue | null>(null);

export const AuthUserProvider = AuthUserContext.Provider;

function useAuthContext(): AuthContextValue {
  const value = useContext(AuthUserContext);
  if (!value) {
    throw new Error("useAuthUser must be used inside the dashboard layout");
  }

  return value;
}

export function useAuthUser(): AuthUser {
  return useAuthContext().user;
}

// Separado de useAuthUser para que as telas que só leem o usuário não precisem
// saber que existe um refresh — nenhuma delas muda.
export function useRefreshAuthUser(): () => Promise<void> {
  return useAuthContext().refresh;
}
```

- [ ] **Step 2: Ajustar o layout**

Em `web/app/dashboard/layout.tsx`:

Acrescentar `useCallback` e `useMemo` ao import de `react`, e `Settings02Icon` ao import de `@hugeicons/core-free-icons`. **Antes de usar, confirmar que `Settings02Icon` é realmente exportado** — se não for, escolher o ícone de engrenagem que existir e registrar a substituição no relatório.

Adicionar o item ao array `navItems`, depois de "Agenda":

```tsx
  {
    label: "Configurações",
    href: "/dashboard/settings",
    icon: Settings02Icon,
    roles: ["SUPERADMIN", "ADMIN", "EMPLOYEE"],
  },
```

Substituir o bloco do `useEffect` (hoje nas linhas 66-79) por um callback reutilizável mais o efeito:

```tsx
  const loadUser = useCallback(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return Promise.resolve();
    }

    return fetchAdapter<{ user: AuthUser }>({ method: "GET", path: "/auth/me" })
      .then(({ data }) => setUser(data.user))
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // O contexto precisa de identidade estável: recriar o objeto a cada render
  // faria toda tela consumidora re-renderizar sem motivo.
  const contextValue = useMemo(
    () => (user ? { user, refresh: loadUser } : null),
    [user, loadUser],
  );
```

O `setUser` continua dentro do `.then()`, não no corpo do efeito — é a mesma forma de hoje, e não introduz problema novo de `react-hooks/set-state-in-effect`.

Trocar o early return e a abertura do provider:

```tsx
  if (!user || !contextValue) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-background">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  return (
    <AuthUserProvider value={contextValue}>
```

`useMemo` fica acima do early return, junto dos outros hooks — nenhum hook pode ficar depois de um `return` condicional.

- [ ] **Step 3: Verificar**

```bash
cd web && npm run typecheck && npm run lint && npm run build && npm test
```

Expected: typecheck limpo; lint com os DOIS problemas pré-existentes e nenhum novo; build compila; 62/62.

Com a API e o web rodando, logar como `ana@teste.com` / `Admin123!` e conferir que **as telas existentes continuam iguais**: Visão geral, Serviços e Equipe carregam normalmente (todas usam `useAuthUser()`), e o item "Configurações" aparece na sidebar. Clicar nele leva a um 404 — a página só chega na Task 7, e isso é esperado neste ponto.

- [ ] **Step 4: Commit**

```bash
git add web/app/dashboard/auth-context.tsx web/app/dashboard/layout.tsx
git commit -m "feat(web): make the dashboard auth context refreshable"
```

---

### Task 7: A tela de configurações

**Files:**
- Create: `web/app/dashboard/settings/profile-card.tsx`
- Create: `web/app/dashboard/settings/password-card.tsx`
- Create: `web/app/dashboard/settings/business-card.tsx`
- Create: `web/app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `useAuthUser`, `useRefreshAuthUser` (Task 6); `PUT /auth/me` (Task 3), `PUT /auth/me/password` (Task 4), `PUT /businesses/:id` (Task 5); `AuthUser` com `business.address` (Task 2).
- Produces: a rota `/dashboard/settings`.

Três cartões independentes, cada um com o próprio estado e o próprio submit. Um cartão falhando não afeta os outros.

- [ ] **Step 1: Cartão de perfil**

Criar `web/app/dashboard/settings/profile-card.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AuthUser } from "@/lib/auth";
import { useRefreshAuthUser } from "../auth-context";

function translateError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erro inesperado.";

  if (error.status === 401) return "Senha atual incorreta.";
  if (error.status === 409) return "Esse e-mail já está em uso por outra conta.";
  if (error.status === 400) return "Confirme sua senha atual para trocar o e-mail.";

  return error.message;
}

export function ProfileCard({ user }: { user: AuthUser }) {
  const refresh = useRefreshAuthUser();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Comparar com o valor que veio do servidor decide se o campo de senha
  // aparece — a mesma regra que o service aplica, espelhada para o usuário
  // não descobrir a exigência só depois de tomar um 400.
  const emailChanged = email.trim().toLowerCase() !== user.email.trim().toLowerCase();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);

    try {
      await fetchAdapter({
        method: "PUT",
        path: "/auth/me",
        body: {
          name,
          email,
          ...(emailChanged ? { currentPassword } : {}),
        },
      });
      setCurrentPassword("");
      setSaved(true);
      await refresh();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Seus dados</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Como seu nome aparece para a equipe e o e-mail que você usa para entrar.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="profile-name">Nome</FieldLabel>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="profile-email">E-mail</FieldLabel>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          {emailChanged ? (
            <Field>
              <FieldLabel htmlFor="profile-current-password">
                Senha atual
              </FieldLabel>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
              <FieldDescription>
                Trocar o e-mail muda como você entra na plataforma, então
                precisamos confirmar que é você.
              </FieldDescription>
            </Field>
          ) : null}

          {error ? <FieldError>{error}</FieldError> : null}
          {saved && !error ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Dados salvos.
            </p>
          ) : null}

          <Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {submitting ? "Salvando…" : "Salvar"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Cartão de senha**

Criar `web/app/dashboard/settings/password-card.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// Mesmo mínimo do schema de PUT /auth/me/password no servidor.
const MIN_PASSWORD_LENGTH = 8;

export function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    setSubmitting(true);
    try {
      await fetchAdapter({
        method: "PUT",
        path: "/auth/me/password",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Senha atual incorreta."
          : "Erro inesperado.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Senha</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Trocar a senha não desconecta seus outros aparelhos.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="current-password">Senha atual</FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <FieldDescription>
              Pelo menos {MIN_PASSWORD_LENGTH} caracteres.
            </FieldDescription>
          </Field>

          {error ? <FieldError>{error}</FieldError> : null}
          {saved && !error ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Senha trocada.
            </p>
          ) : null}

          <Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {submitting ? "Salvando…" : "Trocar senha"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}
```

- [ ] **Step 3: Cartão do negócio**

Criar `web/app/dashboard/settings/business-card.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SLUG_PATTERN } from "@/lib/platform";
import { useRefreshAuthUser } from "../auth-context";

export function BusinessCard({
  business,
}: {
  business: { id: number; name: string; slug: string; address: string | null };
}) {
  const refresh = useRefreshAuthUser();

  const [name, setName] = useState(business.name);
  const [slug, setSlug] = useState(business.slug);
  const [address, setAddress] = useState(business.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const slugChanged = slug !== business.slug;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!SLUG_PATTERN.test(slug)) {
      setError(
        "O endereço só aceita letras minúsculas, números e hífens — como barbearia-do-ze.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await fetchAdapter({
        method: "PUT",
        path: `/businesses/${business.id}`,
        // Campo vazio é ausência de endereço, não string vazia no banco.
        body: { name, slug, address: address.trim() === "" ? null : address.trim() },
      });
      setSaved(true);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Já existe um negócio com esse endereço público."
          : "Erro inesperado.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Seu negócio</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        O que seus clientes veem na página pública.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="business-name">Nome</FieldLabel>
            <Input
              id="business-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="business-slug">Endereço público</FieldLabel>
            <Input
              id="business-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              required
            />
            <FieldDescription>
              Seus clientes acessam em /{slug || business.slug}
              {slugChanged ? (
                <span className="mt-1 block font-medium text-amber-700 dark:text-amber-500">
                  Ao salvar, o endereço antigo (/{business.slug}) para de
                  funcionar. Links já divulgados vão dar erro.
                </span>
              ) : null}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="business-address">Endereço</FieldLabel>
            <Input
              id="business-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Rua das Flores, 123 — Centro"
            />
            <FieldDescription>Opcional. Deixe em branco se não tiver ponto fixo.</FieldDescription>
          </Field>

          {error ? <FieldError>{error}</FieldError> : null}
          {saved && !error ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Negócio atualizado.
            </p>
          ) : null}

          <Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {submitting ? "Salvando…" : "Salvar"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}
```

- [ ] **Step 4: A página**

Criar `web/app/dashboard/settings/page.tsx`:

```tsx
"use client";

import { BusinessCard } from "./business-card";
import { PasswordCard } from "./password-card";
import { ProfileCard } from "./profile-card";
import { useAuthUser } from "../auth-context";

export default function SettingsPage() {
  const user = useAuthUser();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Seus dados de acesso
        {user.role === "ADMIN" ? " e as informações do seu negócio" : ""}.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {/* key no e-mail: depois de salvar, o refresh traz um user novo e o
            cartão remonta com os valores do servidor, não com o estado antigo. */}
        <ProfileCard key={user.email} user={user} />
        <PasswordCard />
        {user.role === "ADMIN" && user.business ? (
          <BusinessCard business={user.business} />
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verificar**

```bash
cd web && npm run typecheck && npm run lint && npm run build && npm test
```

Expected: typecheck limpo; lint com os DOIS pré-existentes e nada novo; build compila com a rota `/dashboard/settings`; 62/62.

Com API e web rodando, logado como `ana@teste.com` / `Admin123!`:

- Os três cartões aparecem. Trocar o nome e salvar: a sidebar atualiza **sem F5**.
- Mudar o e-mail: o campo "Senha atual" aparece sozinho. Salvar com senha errada mostra "Senha atual incorreta."
- Trocar a senha com a atual errada mostra o mesmo erro; com a certa, mostra "Senha trocada." (lembrar de voltar para `Admin123!`).
- No cartão do negócio, editar o slug faz aparecer o aviso âmbar sobre links antigos. Salvar um nome novo atualiza o cabeçalho do dashboard.
- Estreitar abaixo de `sm`: os cartões empilham e a página não rola horizontalmente.
- Logar como EMPLOYEE (criar um pela tela de Equipe e aceitar o convite, ou usar um existente): vê apenas os dois primeiros cartões, sem o do negócio.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
cd server && npm test && npm run typecheck
cd ../web && npm test && npm run typecheck && npm run lint && npm run build
```

Expected: server 93/93 (88 do baseline + 5 da Task 1); web 62/62; nada novo no lint.

- [ ] **Step 7: Commit**

```bash
git add web/app/dashboard/settings/
git commit -m "feat(web): add the settings screen"
```

---

## Dívidas deixadas de propósito

- **Nenhuma sessão é invalidada ao trocar a senha.** O JWT carrega `sub`, `role` e `businessId`, nada derivado da senha, então um token emitido antes continua valendo até expirar. Decisão registrada na spec: trocar a senha não serve, hoje, como reação a "alguém entrou na minha conta".
- **`User.email` continua case-sensitive no banco.** A normalização impede esta tela de criar variantes novas, mas não corrige registros existentes nem o `findByEmail` do login, que faz match exato. Migrar para `citext` é entrega própria.
- **Slug antigo vira 404.** Sem histórico e sem redirect, por decisão explícita — a tela avisa e a responsabilidade fica com quem troca.
- **O endereço não aparece na vitrine pública.** A vitrine vive na `feat/public-showcase`; exibir o campo lá agora criaria conflito de merge por uma linha.
