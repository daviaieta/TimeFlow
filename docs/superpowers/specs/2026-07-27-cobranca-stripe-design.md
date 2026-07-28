# Cobrança de assinatura via Stripe — design

**Data:** 2026-07-27

## Problema

A cobrança de assinatura foi construída nesta mesma branch contra o **Asaas**, mas nunca
chegou à `main`. Dois motivos para trocar por Stripe antes do merge:

1. **Decisão do Davi** (2026-07-27): quer Stripe como gateway.
2. **O fluxo do Asaas não fechava na prática.** A ativação dependia exclusivamente de um
   webhook. Em desenvolvimento o Asaas não tem como chamar `localhost`, então destravar o
   dashboard exigia simular o webhook via `curl` a cada teste — e isso não funcionou quando
   o Davi tentou. O desenho abaixo corrige isso pela raiz (ver "Ativação não depende só do
   webhook").

Como a branch `feat/asaas-billing` ainda não foi mergeada, a troca acontece **dentro dela**:
nada de Asaas chega à `main`. O spec e o plano do Asaas são removidos junto com o código —
tudo que ainda vale foi trazido para cá.

## Decisões que vêm do desenho anterior (continuam valendo, não reabrir)

- **Sem cadastro público.** O convite do SUPERADMIN continua sendo o único jeito de um
  negócio entrar. Cobrança é uma etapa depois que o ADMIN já existe.
- **Sem trial.** Negócio nasce `PENDING` e não acessa o dashboard operacional até ter
  assinatura `ACTIVE`. (Confirmado de novo em 2026-07-27: trial fica para versão futura.)
- **Nenhum dado de cartão passa pelo nosso servidor.** Checkout hospedado pelo gateway.
- **`subscriptionStatus` nunca é escrito por conveniência.** Só muda mediante confirmação
  verificável do gateway — ver a seção de segurança abaixo, que ficou mais rígida com o
  Stripe do que era com o Asaas.
- **Fora de escopo:** upgrade/downgrade de plano, cancelamento self-service, histórico de
  faturas na UI, self-serve signup.

## Decisões novas

### Checkout hospedado, com `price_data` inline (sem Product/Price pré-cadastrado)

`POST /v1/checkout/sessions` em `mode: subscription`, com o preço declarado inline:

```
line_items[0][price_data][currency]=brl
line_items[0][price_data][unit_amount]=4990
line_items[0][price_data][recurring][interval]=month
line_items[0][price_data][product_data][name]=Time Flow - Plano Essencial
```

**Verificado contra a conta real de teste do Davi em 2026-07-27**: BRL, `mode: subscription`
e `price_data` inline funcionam juntos; a sessão volta com `url` para
`checkout.stripe.com`. Não é preciso criar Products/Prices no painel do Stripe.

Isso mantém `billingRules.planPrice()` como **única fonte** dos R$ 49,90 / R$ 89,90 /
R$ 179,90 no servidor (os mesmos valores publicados na landing). A alternativa — Price IDs
pré-criados no Stripe, guardados em variável de ambiente — permitiria mudar preço sem
deploy, mas duplicaria a fonte da verdade e exigiria três variáveis a mais. Com um produto
nesta fase, YAGNI.

### Ativação não depende só do webhook

Este é o ponto que faz o fluxo funcionar em desenvolvimento, e a principal diferença em
relação ao desenho do Asaas. São **dois caminhos independentes** para `ACTIVE`, e os dois
verificam com o Stripe antes de escrever:

1. **Retorno do checkout (caminho principal).** `success_url` aponta para
   `/assinatura?session_id={CHECKOUT_SESSION_ID}`. Ao voltar, o front chama
   `POST /businesses/:id/checkout-session/confirm` com esse `sessionId`; o servidor faz
   `GET /v1/checkout/sessions/:id` **no Stripe** e só ativa se `status === "complete"` e
   `payment_status === "paid"`. Funciona em `localhost` sem webhook nenhum.
2. **Webhook (rede de segurança e ciclo de vida).** Cobre o que o retorno não cobre: o
   usuário que fecha o navegador antes do redirect, renovações mensais, falha de pagamento
   na renovação e cancelamento.

O `sessionId` que o cliente manda **não é confiado**: ele é só uma chave de busca. Quem diz
se foi pago é o Stripe, e o servidor ainda confere que a sessão pertence àquele negócio
(ver segurança).

### Página cheia de assinatura em `/assinatura`

Rota nova em `web/app/assinatura/`, **fora** de `app/dashboard/` — não herda a sidebar nem
o cabeçalho do dashboard. Quem loga sem assinatura ativa cai direto ali: comparativo dos 3
planos com o que cada um inclui (mesma copy da landing), status atual da assinatura, e um
botão por plano que leva ao checkout.

A alternativa (uma página dentro do dashboard) foi descartada em conversa: mostrar sidebar
com Serviços/Equipe/Agenda para quem não pode abrir nenhum deles é pior.

## Segurança

O que muda em relação ao desenho do Asaas, ponto a ponto:

- **Assinatura do webhook.** O Asaas usava um token fixo que nós mesmos gerávamos, comparado
  com `!==`. O Stripe assina cada corpo com HMAC-SHA256 + timestamp (header
  `stripe-signature`). Usamos `stripe.webhooks.constructEvent()` do SDK oficial, que faz
  comparação em tempo constante e rejeita replay fora da janela de tolerância. Isso exige o
  **corpo cru** da requisição: o Fastify parseia JSON por padrão, então a rota de webhook
  vive num plugin encapsulado com um content-type parser próprio (`parseAs: "buffer"`), sem
  afetar nenhuma outra rota.
- **A sessão de checkout é amarrada ao negócio.** A sessão é criada com
  `metadata[businessId]` e `client_reference_id`. Na confirmação, o servidor exige que o
  `metadata.businessId` da sessão bata com o `:id` da URL — sem isso, um ADMIN poderia pegar
  o `session_id` de outro negócio (ou de uma sessão sua já paga) e reusá-lo.
- **Ownership.** `POST /businesses/:id/checkout-session` e `.../confirm` reusam
  `canEditBusiness` (mesmo guard de `PUT /businesses/:id`), checado **antes** de qualquer
  leitura do alvo.
- **`STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`** só em variável de ambiente. A chave
  publicável (`pk_test_...`) **não é usada** — checkout hospedado não precisa dela.
- **Sem PII nova.** `cpfCnpj` é **removido**: era exigência do Asaas. O Stripe coleta os
  dados de cobrança na própria página de checkout, então o campo sai do schema e do
  formulário. Menos dado sensível guardado por nós.

## Modelo de dados

```prisma
model Business {
  // ...campos existentes...
  planName             PlanName?
  subscriptionStatus   SubscriptionStatus @default(PENDING)
  stripeCustomerId     String?            @unique
  stripeSubscriptionId String?            @unique
  // cpfCnpj: REMOVIDO
}
```

`PlanName` e `SubscriptionStatus` não mudam.

**Migration:** uma migration nova e aditiva que renomeia
`asaasCustomerId`/`asaasSubscriptionId` para `stripeCustomerId`/`stripeSubscriptionId` e
derruba `cpfCnpj`. Não reescrevemos a migration anterior: ela já está aplicada no banco
local do Davi (com dados de teste reais que ele usa), e reescrever exigiria `migrate reset`
— destruindo esses dados. A produção no Railway **nunca recebeu** a migration do Asaas
(a branch nunca foi mergeada), então lá as duas migrations aplicam em sequência sem
problema. Custo: o histórico mostra "cria coluna asaas… renomeia para stripe", o que é
exatamente o que aconteceu.

## Endpoints

### `POST /businesses/:id/checkout-session`

`preHandler: [authenticate, authorize(Role.ADMIN)]`. Body:
`{ "planName": "ESSENCIAL" | "PROFISSIONAL" | "EQUIPE" }`, `additionalProperties: false`.

Cria (ou reusa) o Customer no Stripe, cria a Checkout Session, persiste
`planName`/`stripeCustomerId`. **Não** toca `subscriptionStatus`.

Resposta: `{ "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_..." }`

| Situação | Status |
| --- | --- |
| OK | 200 |
| `planName` ausente/inválido | 400 |
| ADMIN de outro negócio | 403 |

### `POST /businesses/:id/checkout-session/confirm`

`preHandler: [authenticate, authorize(Role.ADMIN)]`. Body: `{ "sessionId": "cs_test_..." }`,
`additionalProperties: false`.

Busca a sessão no Stripe. Ativa **apenas** se `status === "complete"`,
`payment_status === "paid"` e `metadata.businessId` bater com `:id`. Guarda
`stripeSubscriptionId` da sessão.

Resposta: `{ "subscriptionStatus": "ACTIVE" | "PENDING" }` — devolve o status real depois da
verificação, para o front decidir se redireciona ou mostra "pagamento ainda processando".

| Situação | Status |
| --- | --- |
| Sessão paga e do negócio certo | 200, `ACTIVE` |
| Sessão existe mas ainda não paga | 200, status atual (não é erro — cartão em análise) |
| `metadata.businessId` diferente do `:id` | 403 |
| Sessão inexistente no Stripe | 404 |
| ADMIN de outro negócio | 403 |

### `POST /webhooks/stripe`

Sem `authenticate`. Corpo cru + `stripe.webhooks.constructEvent()` com
`STRIPE_WEBHOOK_SECRET`. Assinatura inválida → 400 (o Stripe reenvia; 401 seria semanticamente
errado aqui).

Eventos mapeados:

| Evento | Novo status |
| --- | --- |
| `checkout.session.completed` (com `payment_status: "paid"`) | `ACTIVE` |
| `invoice.paid` | `ACTIVE` |
| `invoice.payment_failed` | `PAST_DUE` |
| `customer.subscription.deleted` | `CANCELED` |
| qualquer outro | ignorado, 200 |

Negócio não encontrado pelo `stripeSubscriptionId`/`stripeCustomerId` do evento: responde
200 e loga um warning (não é erro do Stripe, não deve gerar retry) — mesma regra que já
existia.

## Back-end

- **Dependência nova:** `stripe` (SDK oficial). Justificativa: `webhooks.constructEvent` faz
  a verificação de assinatura, que é criptografia sensível e fácil de errar à mão. O resto da
  API poderia ser `fetch` puro, mas usar o SDK para tudo mantém um caminho só.
- `server/src/lib/stripeClient.ts` (novo) — instância do SDK + `createCustomer`,
  `createCheckoutSession`, `retrieveCheckoutSession`. `asaasClient.ts` é **deletado**.
- `server/src/config/env.ts` — `stripeSecretKey`, `stripeWebhookSecret` (ambos `required`);
  as três variáveis `ASAAS_*` saem. `webOrigin` passa a ser usado também para montar
  `success_url`/`cancel_url`.
- `server/src/services/billingRules.ts` — `planPrice`/`planDescription` ficam;
  `planPriceInCents(plan)` novo (o Stripe cobra em centavos, e converter no service com
  `* 100` arredondaria mal); `statusFromStripeEvent(eventType)` substitui
  `statusFromWebhookEvent`; `shouldAutoActivate` (o hack de dev) **sai** — o retorno do
  checkout resolve o problema que ele existia para contornar.
- `server/src/services/billingService.ts` — `createCheckoutSession`, `confirmCheckout`,
  `handleWebhook`.
- `server/src/repositories/businessRepository.ts` — `updateBilling` passa a receber
  `{ planName, stripeCustomerId }`; `setStripeSubscriptionId(id, subscriptionId)` novo;
  `findByStripeSubscriptionId` e `findByStripeCustomerId` substituem
  `findByAsaasSubscriptionId`.
- `server/src/routes/billingRoutes.ts` — as duas rotas autenticadas; o webhook vai para
  `stripeWebhookRoutes` (plugin separado, por causa do corpo cru).
- `server/src/repositories/userRepository.ts` — `findByIdWithBusiness` deixa de expor
  `cpfCnpj` (que some) e continua expondo `planName`/`subscriptionStatus`.
- `requireActiveSubscription` — **sem mudança nenhuma**. Continua exatamente como está.

## Front-end

- `web/app/assinatura/page.tsx` (novo) — página cheia. Carrega `/auth/me`; se já está
  `ACTIVE`, manda para `/dashboard`. Se voltou do Stripe (`?session_id=`), chama o endpoint
  de confirmação antes de decidir. Mostra os 3 planos com preço e lista de recursos (mesma
  copy de `web/app/page.tsx`), destacando o "Profissional" como na landing.
- `web/app/login/login-form.tsx` — depois de `saveToken`, busca `/auth/me` e roteia:
  SUPERADMIN ou assinatura `ACTIVE` → `/dashboard`; senão → `/assinatura`. Sem isso o
  usuário passa pelo dashboard e é expulso, o que pisca.
- `web/app/dashboard/layout.tsx` — o `useEffect` de gate passa a redirecionar para
  `/assinatura` (era `/dashboard/settings`), e a condição de exceção de caminho sai (não há
  mais rota de dashboard que um inadimplente possa abrir).
- `web/app/dashboard/settings/billing-card.tsx` — encolhe: mostra plano e status atuais e um
  link "Gerenciar assinatura" para `/assinatura`. Todo o formulário (planos + CPF/CNPJ) sai
  daqui, porque agora vive na página nova.
- `web/lib/auth.ts` — sem mudança (os tipos `PlanName`/`SubscriptionStatus` já existem e
  continuam válidos; `cpfCnpj` nunca esteve exposto no front).

## Testes

Regras puras, `node:test`, TDD:

- `planPriceInCents`: 4990 / 8990 / 17990 — inteiros exatos, sem resíduo de float.
- `statusFromStripeEvent`: `checkout.session.completed` e `invoice.paid` → `ACTIVE`;
  `invoice.payment_failed` → `PAST_DUE`; `customer.subscription.deleted` → `CANCELED`;
  evento desconhecido → `null`.
- `planPrice`/`planDescription`: testes existentes continuam valendo, sem mudança.

`stripeClient`, `billingService`, repositórios e middleware não têm teste unitário — rede e
Prisma, mesma convenção do resto do projeto.

Verificação manual, contra a conta de teste real:
1. ADMIN sem assinatura loga → cai em `/assinatura`, não no dashboard.
2. Escolhe um plano → vai para `checkout.stripe.com`, paga com o cartão de teste
   `4242 4242 4242 4242` (qualquer validade futura e CVC).
3. Volta para `/assinatura?session_id=...` → confirma sozinho e segue para `/dashboard`.
4. `GET /services` passa a responder 200 (antes: 402).
5. Webhook com assinatura inválida → 400, status não muda.

## Fora de escopo

Upgrade/downgrade de plano · cancelamento self-service · portal de faturas do Stripe
(`billing_portal`) · cupom/desconto · trial · self-serve signup · nota fiscal / coleta de
CPF-CNPJ para fins fiscais (o Stripe coleta o que precisa para cobrar; emissão de NF é outro
problema, para quando houver faturamento real).
