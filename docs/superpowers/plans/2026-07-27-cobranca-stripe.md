# Cobrança de assinatura via Stripe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o gateway de cobrança de Asaas para Stripe dentro da própria branch (nada
de Asaas chega à `main`), e mover a assinatura para uma página cheia em `/assinatura` onde
cai quem loga sem plano ativo.

**Architecture:** Schema, gate (`requireActiveSubscription`) e `PaymentRequiredError`
continuam iguais — só o gateway muda. O ganho central: além do webhook, a ativação também
acontece no **retorno do checkout** (`success_url` → o front chama um endpoint que pergunta
ao Stripe se a sessão foi paga). Isso faz o fluxo fechar em `localhost`, sem túnel nem
webhook forwarding — o problema que travou o Davi no Asaas.

**Tech Stack:** Fastify 5 · Prisma 6.1 (PostgreSQL) · Stripe SDK v22 · Next.js 16 · React 19
· testes `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-27-cobranca-stripe-design.md`

**Branch:** `feat/asaas-billing` (mesma branch; o nome fica, o conteúdo passa a ser Stripe).

## Global Constraints

- Todo schema JSON de rota Fastify novo inclui `additionalProperties: false`.
- Camadas: `routes` → `controller` (fino, zero lógica) → `service` → `repository`. Regra pura
  não importa Prisma nem faz rede.
- Mensagens de erro do servidor em inglês; UI em português; comentários em português
  explicando o PORQUÊ.
- `errorHandler.ts` já trata qualquer `AppError` pelo `statusCode` — não precisa mudar.
- `STRIPE_SECRET_KEY` já está em `server/.env` (gitignorado) e é uma chave de **teste** real,
  já validada. **Nunca** commitar o valor, nem imprimi-lo inteiro em log/report/PR.
- A chave publicável (`pk_test_...`) **não é usada** neste plano — checkout hospedado não
  precisa dela. Não adicione ao front.
- Baseline: `cd server && npm test` = **124/124** antes deste plano. Só a Task 3 mexe nessa
  contagem (vai a 126).
- Web: `cd web && npm run typecheck && npm run lint && npm run build`. Único problema de lint
  pré-existente e tolerado: erro em `web/app/landing-header.tsx:19`.
- **Higiene de processo:** antes de subir servidor pra verificar, rode
  `lsof -nP -iTCP:3333 -sTCP:LISTEN` e mate o que estiver lá; ao terminar, mate o PID que
  você subiu e confirme que a porta ficou livre.

---

### Task 1: Schema Stripe + repositório

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: migration via `prisma migrate dev`
- Modify: `server/src/repositories/businessRepository.ts`
- Modify: `server/src/repositories/userRepository.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `Business.stripeCustomerId` / `stripeSubscriptionId` (sem `cpfCnpj`);
  `businessRepository.updateBilling(id, { planName, stripeCustomerId })`,
  `setStripeSubscriptionId(id, subscriptionId)`, `findByStripeSubscriptionId(id)`,
  `findByStripeCustomerId(id)` — usados pela Task 4.

- [ ] **Step 1: Trocar os campos no schema**

Em `server/prisma/schema.prisma`, no `model Business`, substitua o bloco de cobrança atual:

```prisma
  // Cobrança: nasce PENDING (nunca assinou). Só um webhook do Asaas confirma
  // pagamento e vira ACTIVE — nada no fluxo de login muda esse valor.
  planName            PlanName?
  subscriptionStatus  SubscriptionStatus @default(PENDING)
  asaasCustomerId     String?            @unique
  asaasSubscriptionId String?            @unique
  cpfCnpj             String?
```

por:

```prisma
  // Cobrança: nasce PENDING (nunca assinou). Vira ACTIVE só com confirmação
  // verificada do Stripe — pelo retorno do checkout ou pelo webhook. Nada no
  // fluxo de login muda esse valor.
  planName             PlanName?
  subscriptionStatus   SubscriptionStatus @default(PENDING)
  stripeCustomerId     String?            @unique
  stripeSubscriptionId String?            @unique
```

`cpfCnpj` sai: era exigência do Asaas. O Stripe coleta os dados de cobrança na própria
página de checkout.

- [ ] **Step 2: Gerar e aplicar a migration**

```bash
cd server
npx prisma migrate dev --name replace_asaas_with_stripe_billing
```

Esperado: o Prisma gera `DROP COLUMN` das três colunas antigas + `ADD COLUMN` das duas novas
+ os índices únicos. **Isso é o certo aqui** — os IDs do Asaas guardados não servem para
nada agora, então não há o que preservar. Se o Prisma pedir para resetar o banco inteiro,
**pare e reporte BLOCKED**: um reset destruiria os dados de teste locais do Davi, e não é
necessário para uma migration aditiva/destrutiva de coluna.

- [ ] **Step 3: Ajustar os métodos do repositório**

Em `server/src/repositories/businessRepository.ts`, substitua os três métodos de cobrança
(`updateBilling`, `updateSubscriptionStatus`, `findByAsaasSubscriptionId`) por:

```ts
  // Só planName e customer: o stripeSubscriptionId só existe DEPOIS que o
  // pagamento é confirmado, e vem por setStripeSubscriptionId.
  updateBilling(id: number, data: { planName: PlanName; stripeCustomerId: string }) {
    return prisma.business.update({
      where: { id },
      data: { planName: data.planName, stripeCustomerId: data.stripeCustomerId },
    });
  },

  setStripeSubscriptionId(id: number, stripeSubscriptionId: string) {
    return prisma.business.update({
      where: { id },
      data: { stripeSubscriptionId },
    });
  },

  // Único ponto que muda subscriptionStatus — chamado pela confirmação do
  // checkout e pelo webhook, nunca por createCheckoutSession: só o Stripe
  // dizendo que foi pago vira ACTIVE.
  updateSubscriptionStatus(id: number, status: SubscriptionStatus) {
    return prisma.business.update({
      where: { id },
      data: { subscriptionStatus: status },
    });
  },

  findByStripeSubscriptionId(stripeSubscriptionId: string) {
    return prisma.business.findUnique({ where: { stripeSubscriptionId } });
  },

  // Fallback do webhook: nem todo evento de fatura expõe a subscription no
  // mesmo lugar entre versões da API do Stripe, mas todos trazem o customer.
  findByStripeCustomerId(stripeCustomerId: string) {
    return prisma.business.findUnique({ where: { stripeCustomerId } });
  },
```

- [ ] **Step 4: Conferir que nada mais referencia os campos antigos**

```bash
cd server
grep -rn "asaas\|cpfCnpj" src/repositories/
```

Esperado: nenhuma linha. (Os outros arquivos ainda referenciam — são as Tasks 2 e 4.)

- [ ] **Step 5: Verificar**

```bash
cd server && npx prisma generate && npm test 2>&1 | tail -8
```

Esperado: 124/124. O typecheck **vai falhar** neste ponto (`billingService.ts` ainda usa
`asaasCustomerId`) — isso é esperado e some na Task 4; não tente consertar aqui.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/repositories/
git commit -m "feat(server): replace Asaas billing columns with Stripe ones"
```

---

### Task 2: SDK Stripe, config e cliente

**Files:**
- Modify: `server/package.json` (dependência `stripe`)
- Modify: `server/src/config/env.ts`
- Modify: `server/.env.example`
- Create: `server/src/lib/stripeClient.ts`
- Delete: `server/src/lib/asaasClient.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `env.stripeSecretKey`, `env.stripeWebhookSecret`; `stripeClient.createCustomer`,
  `createCheckoutSession`, `retrieveCheckoutSession`, `constructWebhookEvent` — usados pela
  Task 4.

- [ ] **Step 1: Instalar o SDK**

```bash
cd server && npm install stripe
```

- [ ] **Step 2: Trocar as variáveis de ambiente**

Em `server/src/config/env.ts`, substitua as três linhas `asaas*` do objeto `env`:

```ts
  asaasApiUrl: required("ASAAS_API_URL"),
  asaasApiKey: required("ASAAS_API_KEY"),
  asaasWebhookToken: required("ASAAS_WEBHOOK_TOKEN"),
```

por:

```ts
  stripeSecretKey: required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
```

- [ ] **Step 3: Documentar no `.env.example`**

Em `server/.env.example`, substitua o bloco `ASAAS_*` inteiro por:

```bash
# Stripe (cobrança de assinatura). Chave secreta do painel do Stripe —
# sk_test_... em desenvolvimento, sk_live_... em produção.
STRIPE_SECRET_KEY=""

# Segredo de assinatura do webhook. Em produção vem do painel do Stripe ao
# cadastrar o endpoint; em desenvolvimento, do `stripe listen` (CLI). Pode
# ficar vazio localmente: o fluxo principal de ativação não depende do
# webhook, ele confirma no retorno do checkout.
STRIPE_WEBHOOK_SECRET=""
```

Nota: `STRIPE_WEBHOOK_SECRET` é `required()` no `env.ts` — a string vazia do `.env` local
faria o `required()` **falhar**. Então em `server/.env` (o arquivo real, não o example) deixe
um placeholder qualquer não-vazio, ex.: `STRIPE_WEBHOOK_SECRET="whsec_placeholder_dev"`.
Assinatura inválida só derruba a rota de webhook, que não é o caminho principal em dev.

- [ ] **Step 4: Criar o cliente Stripe**

Crie `server/src/lib/stripeClient.ts`:

```ts
import Stripe from "stripe";
import { PlanName } from "@prisma/client";
import { env } from "../config/env";

const stripe = new Stripe(env.stripeSecretKey);

interface CreateCheckoutSessionInput {
  customerId: string;
  businessId: number;
  planName: PlanName;
  amountInCents: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}

export const stripeClient = {
  createCustomer(input: { name: string; email: string; businessId: number }) {
    return stripe.customers.create({
      name: input.name,
      email: input.email,
      metadata: { businessId: String(input.businessId) },
    });
  },

  // price_data inline em vez de um Price pré-cadastrado no painel: mantém
  // billingRules.planPriceInCents como única fonte dos preços, os mesmos que
  // a landing publica.
  createCheckoutSession(input: CreateCheckoutSessionInput) {
    return stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      client_reference_id: String(input.businessId),
      // metadata na sessão identifica o negócio na confirmação e no webhook;
      // subscription_data.metadata carrega o mesmo para a Subscription, que é
      // o objeto referenciado nos eventos de renovação.
      metadata: { businessId: String(input.businessId), planName: input.planName },
      subscription_data: {
        metadata: { businessId: String(input.businessId) },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: input.amountInCents,
            recurring: { interval: "month" },
            product_data: { name: input.productName },
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
  },

  retrieveCheckoutSession(sessionId: string) {
    return stripe.checkout.sessions.retrieve(sessionId);
  },

  // Verificação de assinatura do webhook: HMAC em tempo constante + janela de
  // tolerância de timestamp. Feita pelo SDK de propósito — é criptografia
  // sensível, hand-rolled aqui seria risco sem ganho.
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  },
};
```

- [ ] **Step 5: Deletar o cliente Asaas**

```bash
cd server && git rm src/lib/asaasClient.ts
```

- [ ] **Step 6: Verificar contra a conta de teste real**

Crie `server/src/scripts/_verify-stripe.ts` (temporário):

```ts
import { stripeClient } from "../lib/stripeClient";

async function main() {
  const customer = await stripeClient.createCustomer({
    name: "Verify Task 2",
    email: "verify-task2@timeflow.example",
    businessId: 999,
  });
  console.log("customer:", customer.id);

  const session = await stripeClient.createCheckoutSession({
    customerId: customer.id,
    businessId: 999,
    planName: "ESSENCIAL",
    amountInCents: 4990,
    productName: "Time Flow - Plano Essencial",
    successUrl: "http://localhost:3000/assinatura?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "http://localhost:3000/assinatura",
  });
  console.log("session:", session.id, "status:", session.status);
  console.log("url ok:", session.url?.startsWith("https://checkout.stripe.com/"));

  const fetched = await stripeClient.retrieveCheckoutSession(session.id);
  console.log("metadata.businessId:", fetched.metadata?.businessId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

```bash
cd server && npx tsx src/scripts/_verify-stripe.ts
```

Esperado: `customer: cus_...`, `session: cs_test_... status: open`, `url ok: true`,
`metadata.businessId: 999`. Depois apague o script (não faz parte da entrega):

```bash
rm server/src/scripts/_verify-stripe.ts
```

- [ ] **Step 7: Verificar suíte**

```bash
cd server && npm test 2>&1 | tail -8
```

Esperado: 124/124. Typecheck ainda falha (Task 4 conserta) — não tente consertar aqui.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/config/env.ts .env.example src/lib/stripeClient.ts src/lib/asaasClient.ts
git commit -m "feat(server): add Stripe client and drop the Asaas one"
```

---

### Task 3: Regras puras para Stripe

**Files:**
- Modify: `server/src/services/billingRules.ts`
- Modify: `server/src/services/billingRules.test.ts`

**Interfaces:**
- Consumes: `PlanName`, `SubscriptionStatus` (Prisma).
- Produces: `planPriceInCents(plan)`, `statusFromStripeEvent(eventType)` — usados pela
  Task 4. `planPrice`/`planDescription` continuam existindo, sem mudança.

- [ ] **Step 1: Escrever os testes primeiro**

Em `server/src/services/billingRules.test.ts`, substitua o arquivo inteiro por:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  planDescription,
  planPrice,
  planPriceInCents,
  statusFromStripeEvent,
} from "./billingRules";

test("planPrice devolve os 3 valores certos", () => {
  assert.equal(planPrice("ESSENCIAL"), 49.9);
  assert.equal(planPrice("PROFISSIONAL"), 89.9);
  assert.equal(planPrice("EQUIPE"), 179.9);
});

test("planPriceInCents devolve inteiros exatos, sem resíduo de float", () => {
  assert.equal(planPriceInCents("ESSENCIAL"), 4990);
  assert.equal(planPriceInCents("PROFISSIONAL"), 8990);
  assert.equal(planPriceInCents("EQUIPE"), 17990);
});

test("planDescription nomeia o plano em português", () => {
  assert.equal(planDescription("ESSENCIAL"), "Time Flow - Plano Essencial");
  assert.equal(planDescription("PROFISSIONAL"), "Time Flow - Plano Profissional");
  assert.equal(planDescription("EQUIPE"), "Time Flow - Plano Equipe");
});

test("statusFromStripeEvent ativa no checkout concluído e na fatura paga", () => {
  assert.equal(statusFromStripeEvent("checkout.session.completed"), "ACTIVE");
  assert.equal(statusFromStripeEvent("invoice.paid"), "ACTIVE");
});

test("statusFromStripeEvent marca atraso quando a fatura falha", () => {
  assert.equal(statusFromStripeEvent("invoice.payment_failed"), "PAST_DUE");
});

test("statusFromStripeEvent marca cancelamento quando a assinatura é removida", () => {
  assert.equal(statusFromStripeEvent("customer.subscription.deleted"), "CANCELED");
});

test("statusFromStripeEvent ignora eventos não mapeados", () => {
  assert.equal(statusFromStripeEvent("checkout.session.expired"), null);
  assert.equal(statusFromStripeEvent("payment_intent.created"), null);
  assert.equal(statusFromStripeEvent("algo-desconhecido"), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd server && npm test 2>&1 | grep -A3 billingRules | head -20
```

Esperado: falha de import — `planPriceInCents` e `statusFromStripeEvent` não existem.

- [ ] **Step 3: Implementar**

Em `server/src/services/billingRules.ts`, acrescente `PLAN_CENTS` logo abaixo de
`PLAN_PRICES`:

```ts
// Centavos como literal, não planPrice * 100: 49.9 * 100 dá 4989.999... em
// float, e o Stripe recusa unit_amount não-inteiro.
const PLAN_CENTS: Record<PlanName, number> = {
  ESSENCIAL: 4990,
  PROFISSIONAL: 8990,
  EQUIPE: 17990,
};
```

Acrescente a função depois de `planPrice`:

```ts
export function planPriceInCents(plan: PlanName): number {
  return PLAN_CENTS[plan];
}
```

E substitua todo o bloco de `ACTIVE_EVENTS` / `PAST_DUE_EVENTS` / `statusFromWebhookEvent`
por:

```ts
const ACTIVE_EVENTS = new Set(["checkout.session.completed", "invoice.paid"]);
const PAST_DUE_EVENTS = new Set(["invoice.payment_failed"]);
const CANCELED_EVENTS = new Set(["customer.subscription.deleted"]);

// Mapeia só o TIPO do evento. Para checkout.session.completed ainda é preciso
// conferir payment_status === "paid" no próprio objeto — isso fica no
// billingService, que tem o evento inteiro em mãos.
export function statusFromStripeEvent(eventType: string): SubscriptionStatus | null {
  if (ACTIVE_EVENTS.has(eventType)) {
    return SubscriptionStatus.ACTIVE;
  }

  if (PAST_DUE_EVENTS.has(eventType)) {
    return SubscriptionStatus.PAST_DUE;
  }

  if (CANCELED_EVENTS.has(eventType)) {
    return SubscriptionStatus.CANCELED;
  }

  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd server && npm test 2>&1 | tail -8
```

Esperado: **126/126** (124 − 5 testes antigos de `billingRules` + 7 novos = 126).

- [ ] **Step 5: Commit**

```bash
git add src/services/billingRules.ts src/services/billingRules.test.ts
git commit -m "feat(server): map Stripe events and expose plan prices in cents"
```

---

### Task 4: Serviço, controller e rotas do Stripe

**Files:**
- Modify: `server/src/services/billingService.ts`
- Modify: `server/src/controllers/billingController.ts`
- Modify: `server/src/routes/billingRoutes.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: repositório (Task 1), `stripeClient`/`env` (Task 2), `planPriceInCents`/
  `planDescription`/`statusFromStripeEvent` (Task 3), `canEditBusiness` (já existe).
- Produces: `POST /businesses/:id/checkout-session`,
  `POST /businesses/:id/checkout-session/confirm`, `POST /webhooks/stripe` — usados pela
  Task 5.

- [ ] **Step 1: Reescrever o service**

Substitua `server/src/services/billingService.ts` inteiro por:

```ts
import { PlanName, SubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";
import { env } from "../config/env";
import { stripeClient } from "../lib/stripeClient";
import { AppError, ForbiddenError, NotFoundError } from "../lib/errors";
import { businessRepository } from "../repositories/businessRepository";
import { userRepository } from "../repositories/userRepository";
import { canEditBusiness } from "./accountRules";
import { planDescription, planPriceInCents, statusFromStripeEvent } from "./billingRules";

// Descobre a qual negócio um evento do Stripe pertence. Três caminhos, porque
// os objetos de evento não são iguais: a sessão de checkout e a subscription
// carregam nosso metadata.businessId; a fatura não carrega, mas referencia a
// subscription e sempre traz o customer.
async function resolveBusinessFromEvent(event: Stripe.Event) {
  const object = event.data.object as Record<string, unknown>;

  const metadata = object.metadata as Record<string, string> | null | undefined;
  if (metadata?.businessId) {
    return businessRepository.findById(Number(metadata.businessId));
  }

  const subscriptionId = event.type.startsWith("customer.subscription.")
    ? (object.id as string)
    : typeof object.subscription === "string"
      ? object.subscription
      : null;

  if (subscriptionId) {
    const business = await businessRepository.findByStripeSubscriptionId(subscriptionId);
    if (business) {
      return business;
    }
  }

  // Último recurso: o campo `subscription` da fatura mudou de lugar entre
  // versões da API do Stripe, mas `customer` sempre está lá.
  if (typeof object.customer === "string") {
    return businessRepository.findByStripeCustomerId(object.customer);
  }

  return null;
}

export const billingService = {
  async createCheckoutSession(
    businessId: number,
    userBusinessId: number | null,
    adminUserId: number,
    input: { planName: PlanName },
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

    // Reusa o customer se já existe — cada clique em "Assinar" criaria um
    // cliente novo no Stripe sem isso.
    let customerId = business.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeClient.createCustomer({
        name: admin.name,
        email: admin.email,
        businessId,
      });
      customerId = customer.id;
    }

    const session = await stripeClient.createCheckoutSession({
      customerId,
      businessId,
      planName: input.planName,
      amountInCents: planPriceInCents(input.planName),
      productName: planDescription(input.planName),
      successUrl: `${env.webOrigin}/assinatura?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${env.webOrigin}/assinatura`,
    });

    if (!session.url) {
      throw new AppError("Stripe did not return a checkout URL", 502);
    }

    // subscriptionStatus NÃO muda aqui: criar a sessão não é pagar.
    await businessRepository.updateBilling(businessId, {
      planName: input.planName,
      stripeCustomerId: customerId,
    });

    return { checkoutUrl: session.url };
  },

  async confirmCheckout(
    businessId: number,
    userBusinessId: number | null,
    sessionId: string,
  ): Promise<{ subscriptionStatus: SubscriptionStatus }> {
    if (!canEditBusiness(businessId, userBusinessId)) {
      throw new ForbiddenError("You do not have permission to manage this business's subscription");
    }

    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripeClient.retrieveCheckoutSession(sessionId);
    } catch {
      throw new NotFoundError("Checkout session not found");
    }

    // O sessionId vem do cliente, então não vale nada sozinho: quem diz se foi
    // pago é o Stripe, e a sessão ainda precisa ser DESTE negócio — sem este
    // cheque, um ADMIN poderia colar o session_id pago de outro negócio.
    if (session.metadata?.businessId !== String(businessId)) {
      throw new ForbiddenError("This checkout session does not belong to this business");
    }

    if (session.status !== "complete" || session.payment_status !== "paid") {
      // Não é erro: cartão em análise, ou o usuário voltou sem concluir.
      return { subscriptionStatus: business.subscriptionStatus };
    }

    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

    if (subscriptionId) {
      await businessRepository.setStripeSubscriptionId(businessId, subscriptionId);
    }

    await businessRepository.updateSubscriptionStatus(businessId, SubscriptionStatus.ACTIVE);

    return { subscriptionStatus: SubscriptionStatus.ACTIVE };
  },

  async handleWebhook(event: Stripe.Event): Promise<void> {
    const status = statusFromStripeEvent(event.type);
    if (!status) {
      // Evento não mapeado — alto volume, esperado, sem ação.
      return;
    }

    // checkout.session.completed também dispara para sessão não paga (ex.:
    // boleto aguardando compensação). Só "paid" ativa.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") {
        return;
      }
    }

    const business = await resolveBusinessFromEvent(event);
    if (!business) {
      // Evento real do Stripe para uma assinatura que não reconhecemos — não é
      // erro do Stripe (por isso ainda respondemos 200), mas é o sinal
      // operacional que revelaria assinatura órfã. console.warn e não
      // request.log porque o Fastify deste projeto sobe sem `logger`
      // configurado em app.ts: request.log seria um logger nulo.
      console.warn(`Stripe webhook: no Business matches event ${event.type} (${event.id})`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subscriptionId) {
        await businessRepository.setStripeSubscriptionId(business.id, subscriptionId);
      }
    }

    await businessRepository.updateSubscriptionStatus(business.id, status);
  },
};
```

- [ ] **Step 2: Reescrever o controller**

Substitua `server/src/controllers/billingController.ts` inteiro por:

```ts
import { PlanName } from "@prisma/client";
import type Stripe from "stripe";
import { FastifyReply, FastifyRequest } from "fastify";
import { BadRequestError } from "../lib/errors";
import { stripeClient } from "../lib/stripeClient";
import { billingService } from "../services/billingService";

export interface CheckoutSessionParams {
  id: number;
}

export interface CheckoutSessionBody {
  planName: PlanName;
}

export async function createCheckoutSession(
  request: FastifyRequest<{ Params: CheckoutSessionParams; Body: CheckoutSessionBody }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await billingService.createCheckoutSession(
    request.params.id,
    request.user.businessId,
    request.user.sub,
    request.body,
  );

  reply.send(result);
}

export interface ConfirmCheckoutBody {
  sessionId: string;
}

export async function confirmCheckout(
  request: FastifyRequest<{ Params: CheckoutSessionParams; Body: ConfirmCheckoutBody }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await billingService.confirmCheckout(
    request.params.id,
    request.user.businessId,
    request.body.sessionId,
  );

  reply.send(result);
}

export async function receiveStripeWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const signature = request.headers["stripe-signature"];
  if (typeof signature !== "string") {
    throw new BadRequestError("Missing stripe-signature header");
  }

  let event: Stripe.Event;
  try {
    event = stripeClient.constructWebhookEvent(request.body as Buffer, signature);
  } catch {
    // 400 (e não 401) de propósito: é o que o Stripe espera, e ele reenvia.
    // Sem detalhe do motivo — não ajuda quem está forjando.
    throw new BadRequestError("Invalid webhook signature");
  }

  await billingService.handleWebhook(event);
  reply.status(200).send();
}
```

- [ ] **Step 3: Reescrever as rotas**

Substitua `server/src/routes/billingRoutes.ts` inteiro por:

```ts
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  confirmCheckout,
  createCheckoutSession,
  receiveStripeWebhook,
  CheckoutSessionBody,
  CheckoutSessionParams,
  ConfirmCheckoutBody,
} from "../controllers/billingController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const businessParamsSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id: { type: "integer" },
  },
};

const createCheckoutSessionSchema = {
  params: businessParamsSchema,
  body: {
    type: "object",
    required: ["planName"],
    additionalProperties: false,
    properties: {
      planName: { type: "string", enum: ["ESSENCIAL", "PROFISSIONAL", "EQUIPE"] },
    },
  },
};

const confirmCheckoutSchema = {
  params: businessParamsSchema,
  body: {
    type: "object",
    required: ["sessionId"],
    additionalProperties: false,
    properties: {
      sessionId: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
};

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: CheckoutSessionParams; Body: CheckoutSessionBody }>(
    "/businesses/:id/checkout-session",
    {
      schema: createCheckoutSessionSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    createCheckoutSession,
  );

  app.post<{ Params: CheckoutSessionParams; Body: ConfirmCheckoutBody }>(
    "/businesses/:id/checkout-session/confirm",
    {
      schema: confirmCheckoutSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    confirmCheckout,
  );
}

// Plugin separado por causa do corpo cru: constructEvent precisa dos bytes
// EXATOS que o Stripe assinou, e o parser JSON padrão do Fastify entregaria um
// objeto reserializado — a assinatura nunca bateria. Como content type parser
// é encapsulado por plugin, isolar aqui não afeta nenhuma outra rota.
export async function stripeWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.post("/webhooks/stripe", receiveStripeWebhook);
}
```

- [ ] **Step 4: Registrar o plugin do webhook**

Em `server/src/app.ts`, troque o import:

```ts
import { billingRoutes } from "./routes/billingRoutes";
```

por:

```ts
import { billingRoutes, stripeWebhookRoutes } from "./routes/billingRoutes";
```

E logo depois de `app.register(billingRoutes);`, acrescente:

```ts
  app.register(stripeWebhookRoutes);
```

- [ ] **Step 5: Verificar que não sobrou nada de Asaas no servidor**

```bash
cd server && grep -rni "asaas" src/ prisma/ .env.example | grep -v "migrations/"
```

Esperado: nenhuma linha (as migrations antigas mantêm o nome no histórico, e isso é
esperado).

- [ ] **Step 6: Verificar typecheck, build e suíte**

```bash
cd server && npm run typecheck && npm run build && npm test 2>&1 | tail -8
```

Esperado: typecheck e build **limpos agora** (era aqui que a dívida das Tasks 1-2 fechava);
126/126.

- [ ] **Step 7: Verificação ao vivo, ponta a ponta**

Suba o servidor limpo e percorra o fluxo. Antes: `lsof -nP -iTCP:3333 -sTCP:LISTEN` e mate o
que houver.

```bash
cd server
npm run build && node dist/server.js &
sleep 2

TOKEN=$(curl -s -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@timeflow.com","password":"SuperAdmin123!"}' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).token))')

curl -s -X POST http://localhost:3333/businesses \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Verify Stripe","slug":"verify-stripe","admin":{"name":"Admin Stripe","email":"verify-stripe@timeflow.example"}}'
```

Pegue o `inviteToken` do admin criado (via `npx tsx` com o Prisma client, ou
`npx prisma studio`), aceite o convite em `POST /auth/accept-invite` com uma senha de teste,
e use o token que volta:

```bash
ADMIN_TOKEN="<token do accept-invite>"
BUSINESS_ID="<id do negócio criado>"

curl -s -X POST http://localhost:3333/businesses/$BUSINESS_ID/checkout-session \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"planName":"ESSENCIAL"}'
```

Esperado: `{"checkoutUrl":"https://checkout.stripe.com/c/pay/cs_test_..."}`.

Confirme que o gate continua fechado (a sessão foi criada, mas nada foi pago):

```bash
curl -s -o /dev/null -w "services antes de pagar: %{http_code}\n" http://localhost:3333/services \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Esperado: **402**. Depois teste a confirmação com uma sessão não paga:

```bash
curl -s -X POST http://localhost:3333/businesses/$BUSINESS_ID/checkout-session/confirm \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"sessionId":"<cs_test_... da resposta anterior>"}'
```

Esperado: `{"subscriptionStatus":"PENDING"}` — **não** ACTIVE, porque ninguém pagou. Este é
o cheque mais importante desta task.

E o webhook sem assinatura válida:

```bash
curl -s -o /dev/null -w "webhook sem assinatura: %{http_code}\n" -X POST http://localhost:3333/webhooks/stripe \
  -H "Content-Type: application/json" -d '{"type":"invoice.paid"}'
```

Esperado: **400**.

Limpe o negócio de teste (delete o `User` e depois o `Business`) e mate o servidor.

- [ ] **Step 8: Commit**

```bash
git add src/services/billingService.ts src/controllers/billingController.ts src/routes/billingRoutes.ts src/app.ts
git commit -m "feat(server): create and confirm Stripe checkout sessions"
```

---

### Task 5: Página cheia de assinatura

**Files:**
- Create: `web/app/assinatura/page.tsx`
- Create: `web/app/assinatura/plan-grid.tsx`

**Interfaces:**
- Consumes: `POST /businesses/:id/checkout-session` e `.../confirm` (Task 4);
  `AuthUser` de `web/lib/auth.ts`; `fetchAdapter`/`ApiError`.
- Produces: a rota `/assinatura` — usada pela Task 6 (redirects).

- [ ] **Step 1: Grid de planos**

Crie `web/app/assinatura/plan-grid.tsx`:

```tsx
"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PlanName } from "@/lib/auth";

// Mesma copy da landing (web/app/page.tsx) — quem chega aqui vindo de lá tem
// que ver a mesma promessa, com os mesmos preços.
export const PLANS: {
  id: PlanName;
  name: string;
  description: string;
  price: string;
  features: string[];
  highlighted: boolean;
}[] = [
  {
    id: "ESSENCIAL",
    name: "Essencial",
    description: "Para autônomos começando a organizar a agenda.",
    price: "R$ 49,90",
    features: [
      "1 profissional",
      "Página pública de agendamento",
      "Reservas ilimitadas",
      "Confirmação por e-mail",
    ],
    highlighted: false,
  },
  {
    id: "PROFISSIONAL",
    name: "Profissional",
    description: "Para negócios com equipe pequena.",
    price: "R$ 89,90",
    features: [
      "Até 5 profissionais",
      "Tudo do Essencial",
      "Agenda em tempo real",
      "Suporte prioritário",
    ],
    highlighted: true,
  },
  {
    id: "EQUIPE",
    name: "Equipe",
    description: "Para operações maiores, com várias unidades.",
    price: "R$ 179,90",
    features: [
      "Profissionais ilimitados",
      "Tudo do Profissional",
      "Múltiplas unidades",
      "Onboarding dedicado",
    ],
    highlighted: false,
  },
];

export function PlanGrid({
  submittingPlan,
  onSelect,
}: {
  submittingPlan: PlanName | null;
  onSelect: (plan: PlanName) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={`relative flex flex-col rounded-2xl border bg-card p-8 ${
            plan.highlighted
              ? "border-indigo-500 shadow-lg ring-1 ring-indigo-500"
              : "shadow-sm"
          }`}
        >
          {plan.highlighted && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white">
              Mais popular
            </span>
          )}
          <h2 className="text-base font-semibold">{plan.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
          <p className="mt-6 text-3xl font-semibold tracking-tight">{plan.price}</p>
          <p className="mt-1 text-xs text-muted-foreground">/mês</p>

          <ul className="mt-6 flex-1 space-y-3 text-sm">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="size-4 shrink-0 text-cyan-500"
                />
                {feature}
              </li>
            ))}
          </ul>

          <Button
            type="button"
            className="mt-8"
            variant={plan.highlighted ? "default" : "outline"}
            disabled={submittingPlan !== null}
            onClick={() => onSelect(plan.id)}
          >
            {submittingPlan === plan.id ? <Spinner data-icon="inline-start" /> : null}
            {submittingPlan === plan.id ? "Abrindo checkout…" : "Assinar"}
          </Button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: A página**

Crie `web/app/assinatura/page.tsx`:

```tsx
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { AuthUser, PlanName, clearToken, getToken } from "@/lib/auth";
import { PlanGrid } from "./plan-grid";

const STATUS_MESSAGES: Record<string, string> = {
  PENDING: "Escolha um plano para liberar o painel do seu negócio.",
  PAST_DUE: "O último pagamento não foi confirmado. Reative escolhendo um plano.",
  CANCELED: "Sua assinatura foi cancelada. Escolha um plano para voltar.",
};

function SubscriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [user, setUser] = useState<AuthUser | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submittingPlan, setSubmittingPlan] = useState<PlanName | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    try {
      const { data } = await fetchAdapter<{ user: AuthUser }>({
        method: "GET",
        path: "/auth/me",
      });

      // Voltando do Stripe: pergunta ao servidor (que pergunta ao Stripe) se a
      // sessão foi paga. É isto que faz o fluxo fechar sem webhook em dev.
      if (sessionId && data.user.business) {
        setConfirming(true);
        try {
          const { data: confirmed } = await fetchAdapter<{ subscriptionStatus: string }>({
            method: "POST",
            path: `/businesses/${data.user.business.id}/checkout-session/confirm`,
            body: { sessionId },
          });

          if (confirmed.subscriptionStatus === "ACTIVE") {
            router.replace("/dashboard");
            return;
          }

          setError(
            "O pagamento ainda não foi confirmado pelo Stripe. Se você acabou de pagar, recarregue em alguns instantes.",
          );
        } catch (err) {
          setError(
            err instanceof ApiError ? err.message : "Não foi possível confirmar o pagamento.",
          );
        } finally {
          setConfirming(false);
        }
      }

      // SUPERADMIN não assina nada; quem já está ativo não tem o que fazer aqui.
      if (data.user.role === "SUPERADMIN" || data.user.business?.subscriptionStatus === "ACTIVE") {
        router.replace("/dashboard");
        return;
      }

      setUser(data.user);
    } catch {
      clearToken();
      router.replace("/login");
    }
  }, [router, sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSelect(plan: PlanName) {
    if (!user?.business) return;

    setError(null);
    setSubmittingPlan(plan);

    try {
      const { data } = await fetchAdapter<{ checkoutUrl: string }>({
        method: "POST",
        path: `/businesses/${user.business.id}/checkout-session`,
        body: { planName: plan },
      });

      // Sai do app de propósito: o checkout é hospedado pelo Stripe.
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado. Tente de novo.");
      setSubmittingPlan(null);
    }
  }

  if (!user || confirming) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {confirming ? "Confirmando seu pagamento…" : "Carregando…"}
        </p>
      </div>
    );
  }

  const status = user.business?.subscriptionStatus ?? "PENDING";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/" className="flex items-center">
          <Logo />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clearToken();
            router.replace("/login");
          }}
        >
          Sair
        </Button>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Ative sua assinatura
          </h1>
          <p className="mt-3 text-muted-foreground">
            {STATUS_MESSAGES[status] ?? STATUS_MESSAGES.PENDING}
          </p>
        </div>

        {error ? (
          <p className="mx-auto mt-6 max-w-xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {error}
          </p>
        ) : null}

        <div className="mt-12">
          <PlanGrid submittingPlan={submittingPlan} onSelect={handleSelect} />
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Pagamento processado pelo Stripe. Seus dados de cartão não passam pelos nossos
          servidores.
        </p>
      </main>
    </div>
  );
}

export default function Page() {
  // useSearchParams exige Suspense no App Router.
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      }
    >
      <SubscriptionPage />
    </Suspense>
  );
}
```

- [ ] **Step 3: Verificar**

```bash
cd web && npm run typecheck && npm run lint && npm run build
```

Esperado: typecheck e build limpos; lint sem problema novo (só o erro pré-existente em
`landing-header.tsx:19`).

- [ ] **Step 4: Commit**

```bash
git add web/app/assinatura/
git commit -m "feat(web): add the full-page subscription screen"
```

---

### Task 6: Redirecionar quem não pagou

**Files:**
- Modify: `web/app/login/login-form.tsx`
- Modify: `web/app/dashboard/layout.tsx`
- Modify: `web/app/dashboard/settings/billing-card.tsx`

**Interfaces:**
- Consumes: a rota `/assinatura` (Task 5); `AuthUser` (já existe).
- Produces: nada — última task.

- [ ] **Step 1: Rotear já no login**

Em `web/app/login/login-form.tsx`, troque o import de `saveToken`:

```ts
import { saveToken } from "@/lib/auth";
```

por:

```ts
import { AuthUser, saveToken } from "@/lib/auth";
```

E substitua o corpo do `try` dentro de `handleSubmit`:

```ts
      const { data } = await fetchAdapter<{ token: string }>({
        method: "POST",
        path: "/auth/login",
        body: { email, password },
      });
      saveToken(data.token);
      router.push("/dashboard");
```

por:

```ts
      const { data } = await fetchAdapter<{ token: string }>({
        method: "POST",
        path: "/auth/login",
        body: { email, password },
      });
      saveToken(data.token);

      // Decide o destino aqui, e não no dashboard: mandar todo mundo para
      // /dashboard e deixar o layout expulsar quem não pagou faz a tela piscar.
      const { data: me } = await fetchAdapter<{ user: AuthUser }>({
        method: "GET",
        path: "/auth/me",
      });

      const needsSubscription =
        me.user.role !== "SUPERADMIN" &&
        me.user.business !== null &&
        me.user.business.subscriptionStatus !== "ACTIVE";

      router.push(needsSubscription ? "/assinatura" : "/dashboard");
```

- [ ] **Step 2: Apontar o gate do dashboard para /assinatura**

Em `web/app/dashboard/layout.tsx`, substitua o `useEffect` do gate:

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

por:

```ts
  // Sem assinatura ativa não há nada de útil no dashboard: manda para a
  // página de assinatura, que é cheia e não tem sidebar. Sem trial: bloqueia
  // desde a criação do negócio, não só depois de um período gratuito.
  useEffect(() => {
    if (
      user &&
      user.role !== "SUPERADMIN" &&
      user.business &&
      user.business.subscriptionStatus !== "ACTIVE"
    ) {
      router.replace("/assinatura");
    }
  }, [user, router]);
```

Se `pathname` ficar sem uso no arquivo depois disso, **não remova** — ele ainda é usado pela
navegação lateral (`const active = pathname === item.href`).

- [ ] **Step 3: Encolher o card de assinatura em Configurações**

Substitua `web/app/dashboard/settings/billing-card.tsx` inteiro por:

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlanName, SubscriptionStatus } from "@/lib/auth";

const PLAN_LABELS: Record<PlanName, string> = {
  ESSENCIAL: "Essencial",
  PROFISSIONAL: "Profissional",
  EQUIPE: "Equipe",
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  PENDING: "Sem assinatura ativa",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento atrasado",
  CANCELED: "Cancelada",
};

// O formulário de planos vive em /assinatura agora — aqui fica só o estado
// atual e o caminho para lá, pra não manter duas telas de cobrança.
export function BillingCard({
  planName,
  subscriptionStatus,
}: {
  planName: PlanName | null;
  subscriptionStatus: SubscriptionStatus;
}) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Assinatura</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Status atual: {STATUS_LABELS[subscriptionStatus]}
        {planName ? ` · Plano ${PLAN_LABELS[planName]}` : ""}
      </p>

      <Button asChild variant="outline" size="sm" className="mt-6">
        <Link href="/assinatura">
          {subscriptionStatus === "ACTIVE" ? "Ver planos" : "Ativar assinatura"}
        </Link>
      </Button>
    </section>
  );
}
```

- [ ] **Step 4: Ajustar quem renderiza o card**

Em `web/app/dashboard/settings/page.tsx`, substitua a chamada do `BillingCard`:

```tsx
            <BillingCard
              businessId={user.business.id}
              planName={user.business.planName}
              subscriptionStatus={user.business.subscriptionStatus}
            />
```

por (a prop `businessId` deixou de existir):

```tsx
            <BillingCard
              planName={user.business.planName}
              subscriptionStatus={user.business.subscriptionStatus}
            />
```

- [ ] **Step 5: Verificar**

```bash
cd web && npm run typecheck && npm run lint && npm run build && npm test 2>&1 | tail -8
```

Esperado: typecheck e build limpos; lint sem problema novo; testes sem regressão.

- [ ] **Step 6: Verificação manual no browser, ponta a ponta**

Suba API e web (checando as portas 3333 e 3000 antes, matando o que houver), crie um negócio
de teste como superadmin, aceite o convite do admin, e:

1. Logue como esse admin em `/login` → deve cair em **`/assinatura`**, não no dashboard.
2. Tente abrir `/dashboard/services` na barra de endereço → deve voltar para `/assinatura`.
3. Clique em "Assinar" no plano Profissional → vai para `checkout.stripe.com`.
4. Pague com o cartão de teste **`4242 4242 4242 4242`**, validade futura qualquer, CVC
   qualquer, e complete o checkout.
5. Volta para `/assinatura?session_id=...` → confirma sozinho e vai para `/dashboard`.
6. `/dashboard/services` agora abre normalmente.
7. Em `/dashboard/settings`, o card "Assinatura" mostra "Ativa · Plano Profissional".

Limpe o negócio de teste do banco e mate os dois servidores ao terminar.

- [ ] **Step 7: Commit**

```bash
git add web/app/login/login-form.tsx web/app/dashboard/layout.tsx web/app/dashboard/settings/
git commit -m "feat(web): send unpaid businesses to the subscription page"
```

## Self-Review

**Cobertura do spec:** schema + repositório (Task 1) · SDK/config/cliente (Task 2) · regras
puras (Task 3) · endpoints de checkout, confirmação e webhook (Task 4) · página `/assinatura`
(Task 5) · redirects de login e do dashboard + card encolhido (Task 6). As decisões herdadas
(sem trial, sem self-serve, sem dado de cartão no servidor) não geram task porque nada muda
nelas. O "fora de escopo" do spec (upgrade/downgrade, cancelamento, portal de faturas,
cupom) não tem task, de propósito.

**Placeholders:** nenhum. Todo step traz o código literal, e os comandos de verificação são
executáveis — o fluxo do Stripe (BRL + `mode: subscription` + `price_data` inline + retrieve
da sessão) foi validado contra a conta de teste real do Davi antes deste plano existir.

**Consistência de tipos:** `businessRepository.updateBilling` (Task 1) recebe
`{ planName, stripeCustomerId }` e é chamado exatamente assim na Task 4;
`setStripeSubscriptionId` é chamado nos dois caminhos de ativação (confirmação e webhook).
`planPriceInCents` (Task 3) alimenta `amountInCents` de `createCheckoutSession` (Task 2/4).
`confirmCheckout` devolve `{ subscriptionStatus }`, que a Task 5 lê como
`confirmed.subscriptionStatus === "ACTIVE"`. `BillingCard` perde a prop `businessId` na Task
6 e o único call site é atualizado no mesmo step.

**Dívida temporária deliberada:** o typecheck do servidor fica quebrado entre as Tasks 1 e 4
(o service ainda referencia campos do Asaas). Isso está dito explicitamente nas Tasks 1 e 2
para o implementador não tentar "consertar" fora de hora. A suíte de testes continua verde o
tempo todo, porque nada em `*.test.ts` toca o service.
