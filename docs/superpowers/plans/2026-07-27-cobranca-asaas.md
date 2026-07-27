# Cobrança de assinatura via Asaas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Business` ganha um ciclo de cobrança real via Asaas — o ADMIN escolhe um dos 3
planos, paga via link hospedado pelo Asaas (boleto/pix/cartão), e o dashboard do
ADMIN/EMPLOYEE fica bloqueado até a assinatura estar `ACTIVE`.

**Architecture:** Camada nova (`asaasClient` → `billingService`/`billingRules` →
`billingRoutes`) espelhando o padrão já existente (`businessRepository` →
`businessService` → `businessRoutes`). O status de pagamento nunca entra no JWT — ele é
lido do banco a cada request via um preHandler novo (`requireActiveSubscription`),
porque só um webhook do Asaas (fora do fluxo de login) pode mudá-lo. O front espelha essa
regra: se `subscriptionStatus !== "ACTIVE"`, todo caminho do dashboard redireciona para
`/dashboard/settings`, onde mora o card que inicia o pagamento.

**Tech Stack:** Fastify 5 · Prisma 6.1 (PostgreSQL) · Next.js 16 · React 19 · Asaas API v3
(sandbox) · `fetch` nativo do Node 22 (sem SDK) · testes `node:test` +
`node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-27-cobranca-asaas-design.md`

**Branch:** `feat/asaas-billing` (já criada, com o spec commitado).

## Global Constraints

- Todo schema JSON de rota Fastify novo inclui `additionalProperties: false`.
- Camadas: `routes` → `controller` (fino, zero lógica) → `service` → `repository`. Regra de
  negócio pura vai em módulo que não importa Prisma nem faz `fetch`.
- Mensagens de erro do servidor em inglês; UI em português; comentários em português
  explicando o PORQUÊ.
- `server/src/lib/errorHandler.ts` já trata qualquer classe que estenda `AppError`
  genericamente pelo `statusCode` da instância — nenhuma nova classe de erro precisa de
  mudança nesse arquivo.
- Repositório (Prisma) e cliente de rede (`asaasClient`) não têm teste unitário — convenção
  já em uso no projeto (ver `healthRepository.ts`, sem teste). Regras puras (`billingRules.ts`)
  têm teste, TDD, antes da implementação.
- Servidor: `cd server && npm test` (baseline 119/119) e `npm run typecheck` depois de
  cada task.
- Web: `cd web && npm test`, `npm run typecheck`, `npm run lint`, `npm run build` depois da
  Task 6. Lint pré-existente e não desta branch: erro em `web/app/landing-header.tsx:19`.
- Chave Asaas sandbox já está em `server/.env` (`ASAAS_API_URL`, `ASAAS_API_KEY`,
  `ASAAS_WEBHOOK_TOKEN`) — **nunca** commitar esses valores nem imprimi-los inteiros em
  log/commit/PR. `server/.env` já está no `.gitignore`.
- `PaymentRequiredError` é 402 — HTTP status pouco comum, mas é exatamente o que existe
  pra isso (RFC 7231/9110), e o front já trata por `err.status`, igual aos outros códigos.

---

### Task 1: Schema de cobrança + repositório

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: migration via `prisma migrate dev` (nome gerado no passo 2)
- Modify: `server/src/repositories/businessRepository.ts`
- Modify: `server/src/repositories/userRepository.ts:findByIdWithBusiness`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: enums `PlanName`, `SubscriptionStatus` do `@prisma/client`;
  `businessRepository.updateBilling(id, { planName, asaasCustomerId, asaasSubscriptionId, cpfCnpj })`,
  `businessRepository.updateSubscriptionStatus(id, status)`,
  `businessRepository.findByAsaasSubscriptionId(asaasSubscriptionId)` — usados pela Task 4.
  `findByIdWithBusiness` passa a devolver `business.planName`/`business.subscriptionStatus`
  — usado pela Task 6 (via `/auth/me`).

- [ ] **Step 1: Acrescentar os campos e enums ao schema**

Em `server/prisma/schema.prisma`, depois do `enum Role { ... }` (linha 17), acrescente:

```prisma
enum PlanName {
  ESSENCIAL
  PROFISSIONAL
  EQUIPE
}

enum SubscriptionStatus {
  PENDING
  ACTIVE
  PAST_DUE
  CANCELED
}
```

No `model Business`, substitua o bloco atual:

```prisma
model Business {
  id        Int      @id @default(autoincrement())
  name      String
  slug      String   @unique
  // Nullable de propósito: todo negócio já cadastrado nasce sem endereço, e
  // nem todo negócio tem ponto físico.
  address   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users    User[]
  services Service[]
}
```

por:

```prisma
model Business {
  id        Int      @id @default(autoincrement())
  name      String
  slug      String   @unique
  // Nullable de propósito: todo negócio já cadastrado nasce sem endereço, e
  // nem todo negócio tem ponto físico.
  address   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Cobrança: nasce PENDING (nunca assinou). Só um webhook do Asaas confirma
  // pagamento e vira ACTIVE — nada no fluxo de login muda esse valor.
  planName            PlanName?
  subscriptionStatus  SubscriptionStatus @default(PENDING)
  asaasCustomerId     String?            @unique
  asaasSubscriptionId String?            @unique
  cpfCnpj             String?

  users    User[]
  services Service[]
}
```

- [ ] **Step 2: Gerar e aplicar a migration local**

```bash
cd server
npx prisma migrate dev --name add_billing_to_business
```

Esperado: prompt de confirmação (se houver) aceito, migration criada em
`prisma/migrations/<timestamp>_add_billing_to_business/`, aplicada no Postgres local, `npx
prisma generate` roda sozinho no final (o Prisma CLI faz isso após toda migration).

- [ ] **Step 3: Acrescentar os métodos de escrita/leitura de cobrança ao repositório**

Em `server/src/repositories/businessRepository.ts`, o import do topo hoje é:

```ts
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
```

Troque para:

```ts
import { PlanName, Role, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
```

E acrescente estes três métodos dentro do objeto `businessRepository`, depois de `update`
(antes de `createWithAdmin`):

```ts
  updateBilling(
    id: number,
    data: {
      planName: PlanName;
      asaasCustomerId: string;
      asaasSubscriptionId: string;
      cpfCnpj: string;
    },
  ) {
    return prisma.business.update({
      where: { id },
      data: {
        planName: data.planName,
        asaasCustomerId: data.asaasCustomerId,
        asaasSubscriptionId: data.asaasSubscriptionId,
        cpfCnpj: data.cpfCnpj,
      },
    });
  },

  // Único ponto que muda subscriptionStatus — chamado pelo webhook, nunca por
  // subscribe() diretamente: só o Asaas confirmando o pagamento vira ACTIVE.
  updateSubscriptionStatus(id: number, status: SubscriptionStatus) {
    return prisma.business.update({
      where: { id },
      data: { subscriptionStatus: status },
    });
  },

  findByAsaasSubscriptionId(asaasSubscriptionId: string) {
    return prisma.business.findUnique({ where: { asaasSubscriptionId } });
  },
```

- [ ] **Step 4: Expor `planName`/`subscriptionStatus` em `/auth/me`**

Em `server/src/repositories/userRepository.ts`, dentro de `findByIdWithBusiness`, o
`select` de `business` hoje é:

```ts
        business: { select: { id: true, name: true, slug: true, address: true } },
```

Troque para:

```ts
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            address: true,
            planName: true,
            subscriptionStatus: true,
          },
        },
```

- [ ] **Step 5: Verificar typecheck e build**

```bash
cd server
npm run typecheck
npm run build
```

Esperado: limpo — os dois novos campos e o `PlanName`/`SubscriptionStatus` do
`@prisma/client` já existem depois do `prisma generate` do Step 2.

- [ ] **Step 6: Verificar que a suíte de testes continua passando**

```bash
cd server && npm test 2>&1 | tail -8
```

Esperado: 119/119 (nenhum teste novo nesta task — é só schema e repositório, sem regra
pura nova).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/repositories/businessRepository.ts src/repositories/userRepository.ts
git commit -m "feat(server): add subscription billing fields to Business"
```

---

### Task 2: Config, erro 402 e cliente Asaas

**Files:**
- Modify: `server/src/config/env.ts`
- Modify: `server/.env.example`
- Modify: `server/src/lib/errors.ts`
- Create: `server/src/lib/asaasClient.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `env.asaasApiUrl: string`, `env.asaasApiKey: string`,
  `env.asaasWebhookToken: string`; `PaymentRequiredError` (402); `asaasClient.createCustomer`,
  `asaasClient.createSubscription`, `asaasClient.getFirstSubscriptionPayment` — usados pela
  Task 4. `env.asaasApiUrl`/`asaasWebhookToken` também usados pela Task 5 (rota de webhook).

- [ ] **Step 1: Acrescentar as três variáveis ao `env`**

Em `server/src/config/env.ts`, o objeto `env` hoje termina em:

```ts
export const env = {
  port: Number(process.env.PORT ?? 3333),
  // Em container, o default do Fastify (127.0.0.1) faria o serviço não
  // receber tráfego externo. 0.0.0.0 escuta em todas as interfaces.
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  // CORS aceita todas; o link de convite (e-mail, precisa de uma URL só)
  // usa sempre a primeira — o domínio final, não uma URL de preview.
  webOrigins,
  webOrigin: webOrigins[0],
};
```

Acrescente três chaves antes do `};` final:

```ts
export const env = {
  port: Number(process.env.PORT ?? 3333),
  // Em container, o default do Fastify (127.0.0.1) faria o serviço não
  // receber tráfego externo. 0.0.0.0 escuta em todas as interfaces.
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  // CORS aceita todas; o link de convite (e-mail, precisa de uma URL só)
  // usa sempre a primeira — o domínio final, não uma URL de preview.
  webOrigins,
  webOrigin: webOrigins[0],
  asaasApiUrl: required("ASAAS_API_URL"),
  asaasApiKey: required("ASAAS_API_KEY"),
  asaasWebhookToken: required("ASAAS_WEBHOOK_TOKEN"),
};
```

- [ ] **Step 2: Documentar no `.env.example`**

Em `server/.env.example`, acrescente ao final:

```bash
# Asaas (cobrança de assinatura). Sandbox: https://api-sandbox.asaas.com/v3.
# ASAAS_WEBHOOK_TOKEN é gerado por nós (openssl rand -hex 24) e configurado
# como "Access Token" no painel de webhook do Asaas — não vem do Asaas.
ASAAS_API_URL="https://api-sandbox.asaas.com/v3"
ASAAS_API_KEY=""
ASAAS_WEBHOOK_TOKEN=""
```

- [ ] **Step 3: Verificar que o `required()` já existente cobre as 3 variáveis novas**

`required()` (topo de `env.ts`) já é exercitado hoje por `jwtSecret`/`databaseUrl` — mesmo
padrão, sem lógica nova a testar. Confirme só que o módulo carrega sem erro com o `.env`
real (as 3 variáveis novas já estão lá, ver Global Constraints):

```bash
cd server
npm run build
node -e 'require("dotenv/config"); require("./dist/config/env"); console.log("env ok");'
```

Esperado: `env ok`, sem exceção — prova que `required("ASAAS_API_URL")` etc encontram
valor no `.env` local.

- [ ] **Step 4: Nova classe de erro 402**

Em `server/src/lib/errors.ts`, acrescente ao final do arquivo:

```ts
export class PaymentRequiredError extends AppError {
  constructor(message = "Subscription payment required") {
    super(message, 402);
  }
}
```

- [ ] **Step 5: Cliente Asaas**

Crie `server/src/lib/asaasClient.ts`:

```ts
import { env } from "../config/env";
import { AppError, BadRequestError } from "./errors";

interface AsaasCustomer {
  id: string;
}

interface AsaasSubscription {
  id: string;
}

interface AsaasPayment {
  invoiceUrl: string;
}

async function asaasFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${env.asaasApiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: env.asaasApiKey,
      "User-Agent": "TimeFlow",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();

    // 400 do Asaas normalmente é dado do cliente (CPF/CNPJ inválido) — vira
    // 400 pra quem chamou a nossa API, não 500/502 genérico.
    if (response.status === 400) {
      throw new BadRequestError(`Asaas rejected the request: ${body}`);
    }

    throw new AppError(`Asaas request failed (${response.status})`, 502);
  }

  return response.json() as Promise<T>;
}

export const asaasClient = {
  createCustomer(input: { name: string; email: string; cpfCnpj: string }): Promise<AsaasCustomer> {
    return asaasFetch<AsaasCustomer>("/customers", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  createSubscription(input: {
    customer: string;
    value: number;
    nextDueDate: string;
    description: string;
  }): Promise<AsaasSubscription> {
    return asaasFetch<AsaasSubscription>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: input.customer,
        billingType: "UNDEFINED",
        value: input.value,
        nextDueDate: input.nextDueDate,
        cycle: "MONTHLY",
        description: input.description,
      }),
    });
  },

  async getFirstSubscriptionPayment(subscriptionId: string): Promise<AsaasPayment | null> {
    const result = await asaasFetch<{ data: AsaasPayment[] }>(
      `/subscriptions/${subscriptionId}/payments`,
      { method: "GET" },
    );

    return result.data[0] ?? null;
  },
};
```

- [ ] **Step 6: Verificar contra o sandbox real**

A chave em `server/.env` é uma chave sandbox real e válida (confirmada antes deste plano
existir: `GET /finance/balance` respondeu 200). Verifique o cliente novo direto, com o
mesmo `tsx` que já roda `prisma/seed.ts` no projeto — crie um arquivo temporário:

`server/src/scripts/_verify-asaas.ts`:

```ts
import { asaasClient } from "../lib/asaasClient";

async function main() {
  const customer = await asaasClient.createCustomer({
    name: "Plano Task 2",
    email: "task2@timeflow.example",
    cpfCnpj: "24971563792",
  });
  console.log("customer:", customer.id);

  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + 1);

  const subscription = await asaasClient.createSubscription({
    customer: customer.id,
    value: 49.9,
    nextDueDate: nextDueDate.toISOString().slice(0, 10),
    description: "Time Flow - Plano Essencial",
  });
  console.log("subscription:", subscription.id);

  const payment = await asaasClient.getFirstSubscriptionPayment(subscription.id);
  console.log("invoiceUrl:", payment?.invoiceUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

```bash
cd server
npx tsx src/scripts/_verify-asaas.ts
```

Esperado: três linhas impressas, `invoiceUrl` começando com
`https://sandbox.asaas.com/i/`. Depois de confirmar, apague o arquivo — ele não faz parte
do plano, é só verificação:

```bash
rm server/src/scripts/_verify-asaas.ts
```

- [ ] **Step 7: Verificar typecheck, build e suíte de testes**

```bash
cd server
npm run typecheck
npm run build
npm test 2>&1 | tail -8
```

Esperado: typecheck e build limpos; 119/119 (sem teste novo — `asaasClient` não é testado
unitariamente, por convenção do projeto para código que faz rede/Prisma).

- [ ] **Step 8: Commit**

```bash
git add src/config/env.ts .env.example src/lib/errors.ts src/lib/asaasClient.ts
git commit -m "feat(server): add Asaas API client and PaymentRequiredError"
```

---

### Task 3: Regras puras de cobrança

**Files:**
- Create: `server/src/services/billingRules.ts`
- Test: `server/src/services/billingRules.test.ts`

**Interfaces:**
- Consumes: `PlanName`, `SubscriptionStatus` (Task 1, via `@prisma/client`).
- Produces: `planPrice(plan: PlanName): number`, `planDescription(plan: PlanName): string`,
  `statusFromWebhookEvent(event: string): SubscriptionStatus | null` — usados pela Task 4.

- [ ] **Step 1: Escrever os testes que falham**

`server/src/services/billingRules.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { planDescription, planPrice, statusFromWebhookEvent } from "./billingRules";

test("planPrice devolve os 3 valores certos", () => {
  assert.equal(planPrice("ESSENCIAL"), 49.9);
  assert.equal(planPrice("PROFISSIONAL"), 89.9);
  assert.equal(planPrice("EQUIPE"), 179.9);
});

test("planDescription nomeia o plano em português", () => {
  assert.equal(planDescription("ESSENCIAL"), "Time Flow - Plano Essencial");
  assert.equal(planDescription("PROFISSIONAL"), "Time Flow - Plano Profissional");
  assert.equal(planDescription("EQUIPE"), "Time Flow - Plano Equipe");
});

test("statusFromWebhookEvent mapeia confirmação de pagamento para ACTIVE", () => {
  assert.equal(statusFromWebhookEvent("PAYMENT_CONFIRMED"), "ACTIVE");
  assert.equal(statusFromWebhookEvent("PAYMENT_RECEIVED"), "ACTIVE");
});

test("statusFromWebhookEvent mapeia atraso para PAST_DUE", () => {
  assert.equal(statusFromWebhookEvent("PAYMENT_OVERDUE"), "PAST_DUE");
});

test("statusFromWebhookEvent ignora eventos não mapeados", () => {
  assert.equal(statusFromWebhookEvent("PAYMENT_CREATED"), null);
  assert.equal(statusFromWebhookEvent("PAYMENT_DELETED"), null);
  assert.equal(statusFromWebhookEvent("algo-desconhecido"), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd server && npm test 2>&1 | grep -A2 billingRules
```

Esperado: FALHA — `Cannot find module './billingRules'`.

- [ ] **Step 3: Implementar o mínimo**

`server/src/services/billingRules.ts`:

```ts
import { PlanName, SubscriptionStatus } from "@prisma/client";

// Mesmos valores publicados na landing (web/app/page.tsx) — único lugar por
// trás dos R$ 49,90 / R$ 89,90 / R$ 179,90 do lado do servidor.
const PLAN_PRICES: Record<PlanName, number> = {
  ESSENCIAL: 49.9,
  PROFISSIONAL: 89.9,
  EQUIPE: 179.9,
};

const PLAN_LABELS: Record<PlanName, string> = {
  ESSENCIAL: "Essencial",
  PROFISSIONAL: "Profissional",
  EQUIPE: "Equipe",
};

export function planPrice(plan: PlanName): number {
  return PLAN_PRICES[plan];
}

export function planDescription(plan: PlanName): string {
  return `Time Flow - Plano ${PLAN_LABELS[plan]}`;
}

const ACTIVE_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const PAST_DUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

// O Asaas não emite evento de "assinatura cancelada" — cancelamento é sempre
// uma ação nossa (fora de escopo aqui). Qualquer evento fora dos dois grupos
// abaixo (PAYMENT_CREATED, PAYMENT_UPDATED, PAYMENT_DELETED, etc.) é
// recebido e ignorado: devolve null, o handler não muda nada.
export function statusFromWebhookEvent(event: string): SubscriptionStatus | null {
  if (ACTIVE_EVENTS.has(event)) {
    return SubscriptionStatus.ACTIVE;
  }

  if (PAST_DUE_EVENTS.has(event)) {
    return SubscriptionStatus.PAST_DUE;
  }

  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd server && npm test 2>&1 | tail -8
```

Esperado: 125/125 (119 + 6 novos testes desta task).

- [ ] **Step 5: Typecheck**

```bash
cd server && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/services/billingRules.ts src/services/billingRules.test.ts
git commit -m "feat(server): add pure billing rules (plan price, webhook status mapping)"
```

---

### Task 4: Serviço, controller e rotas de cobrança

**Files:**
- Create: `server/src/services/billingService.ts`
- Create: `server/src/controllers/billingController.ts`
- Create: `server/src/routes/billingRoutes.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `businessRepository.updateBilling/updateSubscriptionStatus/findByAsaasSubscriptionId`,
  `businessRepository.findById` (Task 1); `asaasClient.*`, `PaymentRequiredError`,
  `env.asaasWebhookToken` (Task 2); `planPrice`, `planDescription`,
  `statusFromWebhookEvent` (Task 3); `canEditBusiness` (já existe em
  `server/src/services/accountRules.ts`); `userRepository.findById` (já existe).
- Produces: `POST /businesses/:id/subscription` e `POST /webhooks/asaas` — usados pela
  Task 6 (front) e verificados manualmente nesta task contra o sandbox real.

- [ ] **Step 1: `billingService.ts`**

Crie `server/src/services/billingService.ts`:

```ts
import { PlanName } from "@prisma/client";
import { asaasClient } from "../lib/asaasClient";
import { AppError, ForbiddenError, NotFoundError } from "../lib/errors";
import { businessRepository } from "../repositories/businessRepository";
import { userRepository } from "../repositories/userRepository";
import { canEditBusiness } from "./accountRules";
import { planDescription, planPrice, statusFromWebhookEvent } from "./billingRules";

interface SubscribeInput {
  planName: PlanName;
  cpfCnpj: string;
}

interface WebhookPayload {
  event: string;
  payment?: { subscription?: string };
}

export const billingService = {
  async subscribe(
    businessId: number,
    userBusinessId: number | null,
    adminUserId: number,
    input: SubscribeInput,
  ): Promise<{ checkoutUrl: string }> {
    // Mesma ordem de PUT /businesses/:id: o gate vem antes de qualquer leitura
    // do alvo, pra não vazar a existência de outro negócio via 404 vs 403.
    if (!canEditBusiness(businessId, userBusinessId)) {
      throw new ForbiddenError("You do not have permission to manage this business's subscription");
    }

    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const admin = await userRepository.findById(adminUserId);
    if (!admin) {
      throw new NotFoundError("Admin user not found");
    }

    // Reaproveita o customer se essa empresa já tentou assinar antes (ex.:
    // estava PAST_DUE e está tentando de novo) — evita duplicar cliente no Asaas.
    let customerId = business.asaasCustomerId;
    if (!customerId) {
      const customer = await asaasClient.createCustomer({
        name: admin.name,
        email: admin.email,
        cpfCnpj: input.cpfCnpj,
      });
      customerId = customer.id;
    }

    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);

    const subscription = await asaasClient.createSubscription({
      customer: customerId,
      value: planPrice(input.planName),
      nextDueDate: nextDueDate.toISOString().slice(0, 10),
      description: planDescription(input.planName),
    });

    const payment = await asaasClient.getFirstSubscriptionPayment(subscription.id);
    if (!payment) {
      throw new AppError("Asaas did not return a payment for the new subscription", 502);
    }

    // subscriptionStatus NÃO muda aqui — fica PENDING (ou o que já era) até o
    // webhook confirmar o pagamento de verdade. Marcar ACTIVE neste ponto
    // destravaria o dashboard antes de qualquer dinheiro ter entrado.
    await businessRepository.updateBilling(businessId, {
      planName: input.planName,
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscription.id,
      cpfCnpj: input.cpfCnpj,
    });

    return { checkoutUrl: payment.invoiceUrl };
  },

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    const status = statusFromWebhookEvent(payload.event);
    if (!status || !payload.payment?.subscription) {
      return;
    }

    const business = await businessRepository.findByAsaasSubscriptionId(payload.payment.subscription);
    if (!business) {
      // Assinatura de outro ambiente (ex.: sandbox local de outro dev) ou já
      // removida — não é erro do Asaas, não deve virar retry.
      return;
    }

    await businessRepository.updateSubscriptionStatus(business.id, status);
  },
};
```

- [ ] **Step 2: `billingController.ts`**

Crie `server/src/controllers/billingController.ts`:

```ts
import { PlanName } from "@prisma/client";
import { FastifyReply, FastifyRequest } from "fastify";
import { billingService } from "../services/billingService";

export interface SubscribeParams {
  id: number;
}

export interface SubscribeBody {
  planName: PlanName;
  cpfCnpj: string;
}

export async function subscribe(
  request: FastifyRequest<{ Params: SubscribeParams; Body: SubscribeBody }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await billingService.subscribe(
    request.params.id,
    request.user.businessId,
    request.user.sub,
    request.body,
  );

  reply.send(result);
}

export interface WebhookBody {
  event: string;
  payment?: { id: string; subscription?: string; status: string };
}

export async function receiveWebhook(
  request: FastifyRequest<{ Body: WebhookBody }>,
  reply: FastifyReply,
): Promise<void> {
  await billingService.handleWebhook(request.body);
  reply.status(200).send();
}
```

- [ ] **Step 3: `billingRoutes.ts`**

Crie `server/src/routes/billingRoutes.ts`:

```ts
import { Role } from "@prisma/client";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  receiveWebhook,
  subscribe,
  SubscribeBody,
  SubscribeParams,
  WebhookBody,
} from "../controllers/billingController";
import { env } from "../config/env";
import { UnauthorizedError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const subscribeSchema = {
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
    required: ["planName", "cpfCnpj"],
    additionalProperties: false,
    properties: {
      planName: { type: "string", enum: ["ESSENCIAL", "PROFISSIONAL", "EQUIPE"] },
      // CPF (11 dígitos) ou CNPJ (14), sem pontuação — o Asaas valida o
      // dígito verificador do lado dele.
      cpfCnpj: { type: "string", pattern: "^\\d{11}(\\d{3})?$" },
    },
  },
};

// O Asaas não conhece nosso JWT — a prova de que a chamada é dele mesmo é um
// token fixo configurado no painel do Asaas e conferido aqui.
async function verifyAsaasWebhook(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (request.headers["asaas-access-token"] !== env.asaasWebhookToken) {
    throw new UnauthorizedError("Invalid webhook token");
  }
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: SubscribeParams; Body: SubscribeBody }>(
    "/businesses/:id/subscription",
    {
      schema: subscribeSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    subscribe,
  );

  app.post<{ Body: WebhookBody }>(
    "/webhooks/asaas",
    { preHandler: [verifyAsaasWebhook] },
    receiveWebhook,
  );
}
```

- [ ] **Step 4: Registrar a rota em `app.ts`**

Em `server/src/app.ts`, acrescente o import junto aos outros de rotas:

```ts
import { billingRoutes } from "./routes/billingRoutes";
```

E o registro logo depois de `app.register(businessRoutes);`:

```ts
  app.register(billingRoutes);
```

- [ ] **Step 5: Verificar typecheck, build e suíte**

```bash
cd server
npm run typecheck
npm run build
npm test 2>&1 | tail -8
```

Esperado: limpo; 125/125 (sem teste novo nesta task — service/controller/routes tocam
Prisma e rede, não são cobertos por teste unitário).

- [ ] **Step 6: Verificar as duas rotas de ponta a ponta, contra o sandbox real**

Suba o servidor e crie um negócio de teste (reaproveitando o superadmin já existente no
banco local):

```bash
cd server
npm run build && node dist/server.js &
sleep 2

# login como o superadmin já existente no banco local (ver server/prisma/seed.ts)
TOKEN=$(curl -s -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@timeflow.com","password":"SuperAdmin123!"}' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).token))')

# cria um negócio de teste
curl -s -X POST http://localhost:3333/businesses \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Barbearia Teste Billing","slug":"barbearia-teste-billing","admin":{"name":"Admin Teste","email":"admin-billing-teste@timeflow.example"}}'
```

Pegue o `inviteToken` do admin recém-criado direto do banco (`npx prisma studio` ou
`psql`), aceite o convite via `POST /auth/accept-invite` com uma senha de teste, faça
login como esse admin, e chame a rota de assinatura:

```bash
ADMIN_TOKEN="<token do login do admin de teste>"
BUSINESS_ID="<id devolvido na criação>"

curl -s -X POST http://localhost:3333/businesses/$BUSINESS_ID/subscription \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"planName":"ESSENCIAL","cpfCnpj":"24971563792"}'
```

Esperado: `{"checkoutUrl":"https://sandbox.asaas.com/i/..."}`. Depois, verifique o
webhook (sem token válido, deve recusar; com o token certo, deve aceitar):

```bash
curl -s -o /dev/null -w "sem token: %{http_code}\n" -X POST http://localhost:3333/webhooks/asaas \
  -H "Content-Type: application/json" \
  -d '{"event":"PAYMENT_CONFIRMED","payment":{"id":"pay_x","subscription":"sub_x"}}'

curl -s -o /dev/null -w "token certo: %{http_code}\n" -X POST http://localhost:3333/webhooks/asaas \
  -H "Content-Type: application/json" -H "asaas-access-token: $(grep ASAAS_WEBHOOK_TOKEN .env | cut -d'"' -f2)" \
  -d '{"event":"PAYMENT_CREATED","payment":{"id":"pay_x","subscription":"sub_x"}}'

kill %1
```

Esperado: `sem token: 401`, `token certo: 200`. Limpe o negócio de teste
(`Barbearia Teste Billing`) pelo Prisma Studio antes de seguir, na ordem
`User` (o admin de teste) → `Business` — sem dependências (Service/Availability/Booking)
criadas para ele, a ordem é só essas duas tabelas.

- [ ] **Step 7: Commit**

```bash
git add src/services/billingService.ts src/controllers/billingController.ts src/routes/billingRoutes.ts src/app.ts
git commit -m "feat(server): add subscription endpoints backed by Asaas"
```

---

### Task 5: Gate de assinatura ativa

**Files:**
- Create: `server/src/middlewares/requireActiveSubscription.ts`
- Modify: `server/src/routes/serviceRoutes.ts`
- Modify: `server/src/routes/employeeRoutes.ts`
- Modify: `server/src/routes/availabilityRoutes.ts`
- Modify: `server/src/routes/dashboardRoutes.ts`

**Interfaces:**
- Consumes: `PaymentRequiredError` (Task 2), `businessRepository.findById` (já existe,
  Task 1 não muda a assinatura desse método).
- Produces: nada consumido por outra task — é o preHandler final aplicado nas rotas
  operacionais.

- [ ] **Step 1: Middleware**

Crie `server/src/middlewares/requireActiveSubscription.ts`:

```ts
import { FastifyReply, FastifyRequest } from "fastify";
import { PaymentRequiredError } from "../lib/errors";
import { businessRepository } from "../repositories/businessRepository";

// Lê do banco a cada request, de propósito: subscriptionStatus muda por
// webhook, fora de qualquer login — colocar no JWT deixaria stale até o
// usuário logar de novo.
export async function requireActiveSubscription(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const { businessId } = request.user;
  if (businessId === null) {
    // SUPERADMIN não tem business — nunca é bloqueado por assinatura.
    return;
  }

  const business = await businessRepository.findById(businessId);
  if (!business || business.subscriptionStatus !== "ACTIVE") {
    throw new PaymentRequiredError();
  }
}
```

- [ ] **Step 2: Aplicar em `serviceRoutes.ts`, `employeeRoutes.ts`, `availabilityRoutes.ts`, `dashboardRoutes.ts`**

Regra mecânica, igual nos 4 arquivos: todo array `preHandler: [authenticate, ...]` ganha
`requireActiveSubscription` logo depois de `authenticate`. Acrescente o import
(`import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";`)
no topo de cada um dos 4 arquivos, junto aos outros imports de middleware.

Exemplo do padrão, em `serviceRoutes.ts` — cada ocorrência de:

```ts
      preHandler: [authenticate, authorize(Role.ADMIN)],
```

vira:

```ts
      preHandler: [authenticate, requireActiveSubscription, authorize(Role.ADMIN)],
```

(mesma troca para `authorize(Role.ADMIN, Role.EMPLOYEE)`, `authorize(Role.EMPLOYEE)`, etc —
`requireActiveSubscription` sempre entra depois de `authenticate` e antes de `authorize`,
qualquer que seja o papel exigido.)

Repita em `employeeRoutes.ts`, `availabilityRoutes.ts` e `dashboardRoutes.ts` — cada
ocorrência de `preHandler: [authenticate, ...]` nesses 4 arquivos ganha o middleware novo
no mesmo ponto. **Não** toque `businessRoutes.ts`, `billingRoutes.ts`, `authRoutes.ts`,
`healthRoutes.ts` nem `publicRoutes.ts` — o spec é explícito: barrar a própria rota de
assinatura impediria qualquer ADMIN de pagar.

- [ ] **Step 3: Verificar que nenhuma ocorrência ficou de fora**

```bash
cd server
grep -c "preHandler: \[authenticate" src/routes/serviceRoutes.ts src/routes/employeeRoutes.ts src/routes/availabilityRoutes.ts src/routes/dashboardRoutes.ts
grep -c "requireActiveSubscription" src/routes/serviceRoutes.ts src/routes/employeeRoutes.ts src/routes/availabilityRoutes.ts src/routes/dashboardRoutes.ts
```

Esperado: os dois `grep -c` devolvem os mesmos números, arquivo por arquivo (4, 5, 5, 1 —
uma ocorrência de `requireActiveSubscription` para cada `preHandler: [authenticate` que já
existia: 4 em `serviceRoutes.ts`, 5 em `employeeRoutes.ts`, 5 em `availabilityRoutes.ts`, 1
em `dashboardRoutes.ts`).

- [ ] **Step 4: Verificar typecheck, build e suíte**

```bash
cd server
npm run typecheck
npm run build
npm test 2>&1 | tail -8
```

Esperado: limpo; 125/125 (middleware não tem teste unitário — toca Prisma).

- [ ] **Step 5: Verificar manualmente que o gate barra e libera**

Reusando o admin de teste da Task 4 (ou criando outro, se já foi limpo): logado como um
ADMIN cujo `Business` está `PENDING` (nunca assinou), `GET /services` deve devolver 402.
Depois de simular a confirmação do webhook (`POST /webhooks/asaas` com o token certo e
`event: "PAYMENT_CONFIRMED"`, `payment.subscription` igual ao `asaasSubscriptionId` desse
negócio), a mesma chamada deve devolver 200.

```bash
cd server
node dist/server.js &
sleep 2

ADMIN_TOKEN="<token de login de um admin com subscriptionStatus PENDING>"
curl -s -o /dev/null -w "antes do webhook: %{http_code}\n" http://localhost:3333/services \
  -H "Authorization: Bearer $ADMIN_TOKEN"

ASAAS_SUB_ID="<asaasSubscriptionId desse negócio, via Prisma Studio>"
curl -s -X POST http://localhost:3333/webhooks/asaas \
  -H "Content-Type: application/json" -H "asaas-access-token: $(grep ASAAS_WEBHOOK_TOKEN .env | cut -d'"' -f2)" \
  -d "{\"event\":\"PAYMENT_CONFIRMED\",\"payment\":{\"id\":\"pay_x\",\"subscription\":\"$ASAAS_SUB_ID\"}}"

curl -s -o /dev/null -w "depois do webhook: %{http_code}\n" http://localhost:3333/services \
  -H "Authorization: Bearer $ADMIN_TOKEN"

kill %1
```

Esperado: `antes do webhook: 402`, `depois do webhook: 200`.

- [ ] **Step 6: Commit**

```bash
git add src/middlewares/requireActiveSubscription.ts src/routes/serviceRoutes.ts src/routes/employeeRoutes.ts src/routes/availabilityRoutes.ts src/routes/dashboardRoutes.ts
git commit -m "feat(server): block dashboard routes until subscription is active"
```

---

### Task 6: Card de assinatura e gate no front

**Files:**
- Modify: `web/lib/auth.ts`
- Create: `web/app/dashboard/settings/billing-card.tsx`
- Modify: `web/app/dashboard/settings/page.tsx`
- Modify: `web/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `POST /businesses/:id/subscription` (Task 4); `AuthUser.business.planName`/
  `subscriptionStatus` vindos de `/auth/me` (Task 1, Step 4); `ApiError`/`fetchAdapter` (já
  existem em `web/adapters/fetchAdapter.ts`).
- Produces: nada consumido por outra task — última task do plano.

- [ ] **Step 1: Tipos**

Em `web/lib/auth.ts`, o tipo `AuthUser` hoje é:

```ts
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  business: { id: number; name: string; slug: string; address: string | null } | null;
}
```

Troque para:

```ts
export type PlanName = "ESSENCIAL" | "PROFISSIONAL" | "EQUIPE";
export type SubscriptionStatus = "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  business:
    | {
        id: number;
        name: string;
        slug: string;
        address: string | null;
        planName: PlanName | null;
        subscriptionStatus: SubscriptionStatus;
      }
    | null;
}
```

- [ ] **Step 2: `billing-card.tsx`**

Crie `web/app/dashboard/settings/billing-card.tsx`:

```tsx
"use client";

import { useState } from "react";
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
import { PlanName, SubscriptionStatus } from "@/lib/auth";

const PLANS: { id: PlanName; label: string; price: string }[] = [
  { id: "ESSENCIAL", label: "Essencial", price: "R$ 49,90/mês" },
  { id: "PROFISSIONAL", label: "Profissional", price: "R$ 89,90/mês" },
  { id: "EQUIPE", label: "Equipe", price: "R$ 179,90/mês" },
];

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  PENDING: "Sem assinatura ativa",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento atrasado",
  CANCELED: "Cancelada",
};

function translateError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erro inesperado.";
  if (error.status === 400) return "CPF/CNPJ inválido. Confira e tente de novo.";
  return error.message;
}

export function BillingCard({
  businessId,
  planName,
  subscriptionStatus,
}: {
  businessId: number;
  planName: PlanName | null;
  subscriptionStatus: SubscriptionStatus;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanName>(planName ?? "ESSENCIAL");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsPayment = subscriptionStatus !== "ACTIVE";

  async function handleSubscribe() {
    setError(null);
    setSubmitting(true);

    try {
      const { data } = await fetchAdapter<{ checkoutUrl: string }>({
        method: "POST",
        path: `/businesses/${businessId}/subscription`,
        body: { planName: selectedPlan, cpfCnpj: cpfCnpj.replace(/\D/g, "") },
      });

      // Sai do app de propósito: o checkout é hospedado pelo Asaas, não é
      // uma tela nossa — não faz sentido abrir isso dentro do dashboard.
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(translateError(err));
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Assinatura</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Status atual: {STATUS_LABELS[subscriptionStatus]}
        {planName ? ` · Plano ${PLANS.find((p) => p.id === planName)?.label}` : ""}
      </p>

      {needsPayment ? (
        <div className="mt-6">
          <FieldGroup>
            <Field>
              <FieldLabel>Escolha um plano</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-3">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      selectedPlan === plan.id
                        ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500 dark:bg-indigo-950/40"
                        : "border-zinc-200 hover:bg-muted dark:border-zinc-800"
                    }`}
                  >
                    <p className="font-medium">{plan.label}</p>
                    <p className="text-xs text-muted-foreground">{plan.price}</p>
                  </button>
                ))}
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="billing-cpf-cnpj">CPF ou CNPJ</FieldLabel>
              <Input
                id="billing-cpf-cnpj"
                value={cpfCnpj}
                onChange={(event) => setCpfCnpj(event.target.value)}
                placeholder="Só números"
                required
              />
              <FieldDescription>
                Usado só para gerar a cobrança no Asaas.
              </FieldDescription>
            </Field>

            {error ? <FieldError>{error}</FieldError> : null}

            <Field>
              <Button type="button" onClick={handleSubscribe} disabled={submitting}>
                {submitting ? <Spinner data-icon="inline-start" /> : null}
                {submitting ? "Redirecionando…" : "Assinar"}
              </Button>
            </Field>
          </FieldGroup>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Incluir o card em Configurações**

Em `web/app/dashboard/settings/page.tsx`, hoje:

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

Troque pelo mesmo arquivo com o import e o card novos:

```tsx
"use client";

import { BillingCard } from "./billing-card";
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
          <>
            <BillingCard
              businessId={user.business.id}
              planName={user.business.planName}
              subscriptionStatus={user.business.subscriptionStatus}
            />
            <BusinessCard business={user.business} />
          </>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Gate no layout**

Em `web/app/dashboard/layout.tsx`, depois do bloco:

```ts
  useEffect(() => {
    loadUser();
  }, [loadUser]);
```

Acrescente um segundo `useEffect`:

```ts
  // Sem assinatura ativa, só Configurações fica acessível — é lá que mora o
  // card que inicia o pagamento. Sem trial: bloqueia desde a criação do
  // negócio, não só depois de um período gratuito.
  useEffect(() => {
    if (
      user &&
      user.role !== "SUPERADMIN" &&
      user.business &&
      user.business.subscriptionStatus !== "ACTIVE" &&
      !pathname.startsWith("/dashboard/settings")
    ) {
      router.replace("/dashboard/settings");
    }
  }, [user, pathname, router]);
```

- [ ] **Step 5: Verificar typecheck, lint e build**

```bash
cd web
npm run typecheck
npm run lint
npm run build
```

Esperado: typecheck e build limpos; lint sem problema novo (só o erro pré-existente em
`landing-header.tsx:19`).

- [ ] **Step 6: Verificar a suíte de testes**

```bash
cd web && npm test 2>&1 | tail -8
```

Esperado: sem regressão (nenhum teste puro novo nesta task — é UI e tipos).

- [ ] **Step 7: Verificar manualmente no browser**

```bash
cd web && npm run dev &
```

Login como o admin de teste (`subscriptionStatus: PENDING`) criado nas verificações da
Task 4/5. Esperado: qualquer URL do dashboard (`/dashboard`, `/dashboard/services`, etc)
redireciona sozinha para `/dashboard/settings`; lá, o card "Assinatura" mostra "Sem
assinatura ativa" e os 3 planos; escolher um, preencher um CPF de teste
(`24971563792` funciona no sandbox) e clicar "Assinar" navega para uma URL
`sandbox.asaas.com`. Pare o dev server (`kill %1`) ao terminar.

- [ ] **Step 8: Commit**

```bash
git add web/lib/auth.ts web/app/dashboard/settings/billing-card.tsx web/app/dashboard/settings/page.tsx web/app/dashboard/layout.tsx
git commit -m "feat(web): add subscription card and gate the dashboard on payment"
```

## Self-Review

**Cobertura do spec:** schema + repositório (Task 1) · env/erro 402/cliente Asaas (Task 2)
· regras puras de preço e mapeamento de webhook (Task 3) · endpoints de assinatura e
webhook (Task 4) · gate de acesso nas 4 rotas operacionais (Task 5) · card de assinatura +
gate no front (Task 6). As três decisões da conversa (convite do SUPERADMIN mantido, sem
trial, sandbox por enquanto) aparecem, respectivamente, na Task 4 (fluxo de `subscribe`
não muda o cadastro), Task 5 (gate sem verificação de data/trial) e `env.asaasApiUrl`
apontando pro sandbox (Task 2). "Fora de escopo" do spec (upgrade de plano, cancelamento,
self-serve, histórico de fatura) não tem task — de propósito.

**Placeholders:** nenhum "TBD"/"implementar depois" — todo step tem o código exato, e os
comandos de verificação manual (Task 4/5/6) são reais, testados contra o sandbox nesta
sessão antes do plano ser escrito.

**Consistência de tipos:** `PlanName`/`SubscriptionStatus` nascem no Prisma (Task 1) e são
reexportados como union types de string no front (Task 6, `web/lib/auth.ts`) — mesmos
literais dos dois lados (`"ESSENCIAL" | "PROFISSIONAL" | "EQUIPE"`,
`"PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED"`). `businessRepository.updateBilling`
(Task 1) recebe exatamente os 4 campos que `billingService.subscribe` (Task 4) monta.
`asaasClient.getFirstSubscriptionPayment` (Task 2) devolve `AsaasPayment | null`, e
`billingService.subscribe` (Task 4) trata o `null` como erro 502 — não assume que sempre
vem payment.
