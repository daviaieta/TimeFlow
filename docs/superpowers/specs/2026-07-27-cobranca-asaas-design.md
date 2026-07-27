# Cobrança de assinatura via Asaas — design

**Data:** 2026-07-27

## Problema

Time Flow não cobra ninguém hoje. O `Business` é criado pelo SUPERADMIN, o ADMIN aceita
convite e usa o dashboard livremente, para sempre, sem pagar nada. A landing já anuncia
3 planos com preço real (`R$ 49,90` / `R$ 89,90` / `R$ 179,90` — ver
`docs/superpowers/specs/2026-07-27-precos-landing-design.md`), mas não existe cobrança de
verdade por trás desses números.

Isto é um subsistema novo, sem relação com o item "Pagamento online" já listado como fora
de escopo em `server/PRD.md` — aquele item é sobre o *cliente final* pagar por um serviço
agendado (ex.: pagar o corte de cabelo). Este spec é sobre o *dono do negócio* pagar pela
assinatura da plataforma. São dois fluxos de dinheiro completamente diferentes; o PRD não
precisa mudar.

## Decisões

Três decisões tomadas em conversa, antes deste spec:

1. **Sem cadastro público.** O fluxo de convite do SUPERADMIN continua exatamente como
   hoje. Cobrança entra como uma etapa *depois* que o ADMIN já existe — não antes.
2. **Sem trial.** Um `Business` recém-criado não tem acesso ao dashboard operacional até
   ter uma assinatura `ACTIVE`. Não existe janela de uso grátis.
3. **Asaas em modo sandbox** por enquanto (`https://api-sandbox.asaas.com/v3`), com chave
   de API real fornecida e testada nesta sessão — customer, subscription e o payment da
   primeira cobrança foram criados de verdade no sandbox e confirmam os formatos abaixo.
   Trocar para produção é só apontar `ASAAS_API_URL`/`ASAAS_API_KEY` para os valores reais
   quando o produto for lançado; nenhum código muda.

### Isolamento do dinheiro: nenhum dado de cartão passa pelo nosso servidor

Cada assinatura Asaas é criada com `billingType: "UNDEFINED"` — o cliente escolhe
boleto/pix/cartão na página de checkout hospedada pelo Asaas (`invoiceUrl`). Nosso backend
nunca vê número de cartão, CVV nem nada equivalente — reduz a superfície de
responsabilidade de PCI a zero no nosso lado.

### Como o preço chega no Asaas

Os mesmos três valores já publicados na landing viram uma função pura
(`planPrice(plan: PlanName): number`) em vez de reaparecerem soltos em outro arquivo — um
único lugar por trás dos R$ 49,90 / R$ 89,90 / R$ 179,90 no back-end.

### Trocar de plano

Fora de escopo nesta entrega (ver "Fora de escopo"). Hoje `subscribe` só serve pra ir de
`PENDING`/`PAST_DUE` para uma assinatura nova — não existe fluxo de upgrade/downgrade.

### Confirmado no sandbox: formato real da API Asaas

```
POST /customers
  body: { name, email, cpfCnpj }
  resposta: { id: "cus_...", ... }

POST /subscriptions
  body: { customer, billingType: "UNDEFINED", value, nextDueDate, cycle: "MONTHLY", description }
  resposta: { id: "sub_...", status: "ACTIVE", ... }
  (esse "status" é do lado do Asaas — não confundir com o nosso SubscriptionStatus;
  o Asaas considera a assinatura "ACTIVE" assim que criada, mesmo com o pagamento
  ainda pendente)

GET /subscriptions/{id}/payments
  resposta: { data: [ { id: "pay_...", status: "PENDING", invoiceUrl: "https://...", dueDate, ... } ] }
```

`invoiceUrl` do primeiro item de `data` é o link de checkout que o ADMIN abre para pagar.

### Webhook: só eventos de pagamento existem

O Asaas não notifica "assinatura cancelada" — cancelamento é sempre uma ação nossa (fora
de escopo aqui). Os eventos relevantes, confirmados na documentação:

- `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` → nosso `subscriptionStatus` vira `ACTIVE`.
- `PAYMENT_OVERDUE` → vira `PAST_DUE`.
- Qualquer outro evento (`PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_DELETED`, etc.) é
  recebido com 200 e ignorado — não altera status. Points de extensão futuros, não deste
  pacote.

O corpo do webhook traz `{ event: string, payment: { id, subscription, status, ... } }`;
`payment.subscription` é o `asaasSubscriptionId` que localiza o `Business`.

### Segurança do endpoint de webhook

`POST /webhooks/asaas` não passa por `authenticate` (o Asaas não tem nosso JWT) — em vez
disso, o Asaas é configurado (no painel dele) para reenviar um "Access Token" fixo no
header `asaas-access-token` em toda chamada. O handler compara esse header contra
`env.asaasWebhookToken` (gerado por nós, `openssl rand -hex 24`, guardado só em variável
de ambiente) e responde 401 se não bater — sem isso, qualquer um que descubra a URL do
webhook poderia forjar `PAYMENT_CONFIRMED` e destravar o dashboard de graça.

### Onde o gate de acesso entra

`request.user` (payload do JWT) não carrega `subscriptionStatus` — só `sub`, `role`,
`businessId`. Status de pagamento muda por webhook, de fora de qualquer login; colocar no
JWT deixaria stale até o próximo login. O gate busca o `Business` no banco a cada request.

Novo preHandler `requireActiveSubscription`: para `request.user.businessId === null`
(SUPERADMIN), passa direto. Para ADMIN/EMPLOYEE, busca o `Business`, e se
`subscriptionStatus !== "ACTIVE"` lança um erro novo (`PaymentRequiredError`, HTTP 402).
Aplicado em `serviceRoutes`, `employeeRoutes`, `availabilityRoutes`, `dashboardRoutes` —
**não** em `businessRoutes` (onde mora a rota de assinatura: se o gate barrasse essa rota
também, ninguém conseguiria pagar) nem em `authRoutes`.

No front, `web/app/dashboard/layout.tsx` já busca `/auth/me` a cada carga — a resposta
ganha `business.planName`/`business.subscriptionStatus`. Se o usuário não é SUPERADMIN e
o status não é `ACTIVE`, todo caminho exceto `/dashboard/settings` redireciona para lá.

## Modelo de dados

```prisma
enum PlanName {
  ESSENCIAL
  PROFISSIONAL
  EQUIPE
}

enum SubscriptionStatus {
  PENDING   // nunca assinou
  ACTIVE
  PAST_DUE
  CANCELED  // reservado para quando existir cancelamento (fora de escopo aqui)
}

model Business {
  // ...campos existentes...
  planName            PlanName?
  subscriptionStatus  SubscriptionStatus @default(PENDING)
  asaasCustomerId     String?            @unique
  asaasSubscriptionId String?            @unique
  cpfCnpj             String?
}
```

`cpfCnpj` fica no `Business`, não em tabela própria — é dado de cobrança do negócio, seguindo
o mesmo padrão de `address` (campo direto, sem tabela separada, YAGNI enquanto for 1 CPF/CNPJ
por negócio).

## Endpoints

### `POST /businesses/:id/subscription`

`preHandler: [authenticate, authorize(Role.ADMIN)]`. Reusa `canEditBusiness` (já existe em
`accountRules.ts`, usado por `PUT /businesses/:id`) para garantir que o ADMIN só assina a
própria empresa.

```jsonc
// body
{ "planName": "ESSENCIAL" | "PROFISSIONAL" | "EQUIPE", "cpfCnpj": "24971563792" }
```

`additionalProperties: false`. `cpfCnpj`: string, `minLength: 11, maxLength: 14` (aceita
CPF sem pontuação, 11 dígitos, ou CNPJ, 14 — validação de dígito verificador fica por conta
do Asaas, que já rejeita CPF/CNPJ inválido na criação do customer).

Se o `Business` já tem `asaasCustomerId` (já assinou antes, está `PAST_DUE`), reusa o
customer existente em vez de criar outro — evita duplicar cliente no Asaas a cada nova
tentativa de pagamento.

```jsonc
// resposta 200
{ "checkoutUrl": "https://sandbox.asaas.com/i/wmqo1hdqaled6clr" }
```

| Situação | Status |
| --- | --- |
| OK | 200 |
| `planName`/`cpfCnpj` ausente ou fora do formato | 400 (schema) |
| ADMIN de outro negócio | 403 |
| Asaas rejeita o CPF/CNPJ (formato inválido) | 400 |

### `POST /webhooks/asaas`

Sem `authenticate`. Valida `asaas-access-token` no header contra `env.asaasWebhookToken`.

```jsonc
// body (formato do Asaas)
{ "event": "PAYMENT_CONFIRMED", "payment": { "id": "pay_...", "subscription": "sub_...", "status": "CONFIRMED" } }
```

| Situação | Status |
| --- | --- |
| Token confere, evento tratado ou ignorado | 200 |
| Token não confere | 401 |
| `payment.subscription` não bate com nenhum `Business` | 200 (loga um warning; não é erro do Asaas, não deve gerar retry) |

## Back-end

- `server/prisma/schema.prisma`: campos e enums acima; nova migration.
- `server/src/lib/asaasClient.ts`: `createCustomer`, `createSubscription`,
  `getFirstSubscriptionPayment` — fetch puro contra `env.asaasApiUrl`, header
  `access_token: env.asaasApiKey`.
- `server/src/services/billingRules.ts` (puro, testado):
  - `planPrice(plan: PlanName): number` — 49.90 / 89.90 / 179.90.
  - `planDescription(plan: PlanName): string` — "Time Flow - Plano Essencial" etc, vai no
    campo `description` da assinatura no Asaas.
  - `statusFromWebhookEvent(event: string): SubscriptionStatus | null` — mapeia
    `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` → `ACTIVE`, `PAYMENT_OVERDUE` → `PAST_DUE`,
    qualquer outro → `null`.
- `server/src/services/billingService.ts`:
  - `subscribe(businessId, adminEmail, adminName, { planName, cpfCnpj })` — orquestra
    `asaasClient` + `businessRepository`, devolve `{ checkoutUrl }`.
  - `handleWebhook({ event, payment })` — chama `statusFromWebhookEvent`; se `null`, no-op;
    senão busca `Business` por `asaasSubscriptionId` e atualiza.
- `server/src/repositories/businessRepository.ts`: `updateBilling(businessId, data)`,
  `findByAsaasSubscriptionId(subscriptionId)`.
- `server/src/middlewares/requireActiveSubscription.ts`: preHandler descrito acima.
- `server/src/lib/errors.ts`: nova `PaymentRequiredError extends AppError` (402), mesmo
  padrão de `ForbiddenError`/`ConflictError`. `errorHandler.ts` não muda — ele já trata
  qualquer `AppError` genericamente pelo `statusCode` da instância.
- `server/src/routes/billingRoutes.ts`: as duas rotas acima.
- `server/src/config/env.ts`: `asaasApiUrl`, `asaasApiKey`, `asaasWebhookToken`
  (`required(...)`, mesma convenção de `jwtSecret`).
- `serviceRoutes.ts`, `employeeRoutes.ts`, `availabilityRoutes.ts`, `dashboardRoutes.ts`:
  cada rota ganha `requireActiveSubscription` no array de `preHandler`, depois de
  `authenticate`.
- `server/src/repositories/userRepository.ts:findByIdWithBusiness` — o `select` de
  `business` (hoje `{ id, name, slug, address }`) ganha `planName: true,
  subscriptionStatus: true`. É essa função que monta a resposta de `/auth/me`
  (`authController.ts:me`) e do login — os dois passam a devolver os dois campos novos
  sem mudança de assinatura.

## Front-end

- `web/app/dashboard/settings/billing-card.tsx` (novo, mesmo padrão de
  `business-card.tsx`/`profile-card.tsx`): mostra plano e status atuais; se
  `subscriptionStatus !== "ACTIVE"`, formulário com os 3 planos (nome + preço, mesmos
  valores da landing) + campo CPF/CNPJ + botão "Assinar" → `POST
  /businesses/:id/subscription` → `window.location.href = checkoutUrl` (sai do app,
  igual qualquer checkout hospedado).
- `web/app/dashboard/settings/page.tsx`: inclui o novo card.
- `web/app/dashboard/layout.tsx`: depois de carregar `user`, se `user.role !== "SUPERADMIN"`
  e `user.business?.subscriptionStatus !== "ACTIVE"` e a rota atual não começa com
  `/dashboard/settings`, `router.replace("/dashboard/settings")`.
- `web/lib/auth.ts`: `AuthUser.business` ganha `planName: string | null` e
  `subscriptionStatus: "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED"`.

## Testes

Regras puras, `node:test`, antes da implementação:

- `planPrice`: os 3 planos devolvem os 3 valores certos.
- `statusFromWebhookEvent`: `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` → `ACTIVE`;
  `PAYMENT_OVERDUE` → `PAST_DUE`; `PAYMENT_CREATED` (e qualquer evento não mapeado) →
  `null`.

`asaasClient` e `requireActiveSubscription` tocam Prisma/rede — não são cobertos por teste
unitário, seguindo a convenção do projeto (repositório/integração não tem teste unitário
com banco).

Verificação manual contra o sandbox real (chave já confirmada nesta sessão):
1. ADMIN sem assinatura tenta abrir `/dashboard` → redireciona para `/dashboard/settings`.
2. Assina o plano Essencial com um CPF de teste do Asaas → recebe `checkoutUrl`, abre,
   confirma o pagamento no simulador do sandbox.
3. Webhook chega, `subscriptionStatus` vira `ACTIVE` → dashboard libera.
4. Header do webhook errado → 401, status não muda.

## Fora de escopo

Cadastro público / self-serve · período de trial · upgrade/downgrade de plano · cancelamento
self-service pelo ADMIN · histórico de faturas na UI · múltiplos métodos de pagamento
salvos · retry automático de cobrança vencida (o Asaas já reenvia boleto/pix conforme a
config padrão da conta) · suporte a `SUBSCRIPTION_DELETED`-like (não existe esse evento) ·
qualquer mudança em `server/PRD.md` (o item "Pagamento online" de lá é sobre o cliente
final, não este fluxo).
