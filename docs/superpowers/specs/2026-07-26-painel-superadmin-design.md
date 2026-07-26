# Painel do SUPERADMIN — design

**Data:** 2026-07-26
**Fase do roteiro:** Fase 2, primeira metade (a segunda — `PUT /businesses/:id` e a tela de
configurações do dono — fica fora desta entrega).

## Problema

Hoje um SUPERADMIN que faz login cai em `PlaceholderOverview`
(`web/components/dashboard/placeholder-overview.tsx`): três cartões com `—` e o texto
"Aqui está o resumo da plataforma". É um stub, não um painel.

Não existe nenhum bug de runtime nesse caminho. `GET /dashboard/overview` está guardado
por `authorize(Role.ADMIN)` (`server/src/routes/dashboardRoutes.ts:23`) e o front gateia
com `isAdmin` (`web/app/dashboard/page.tsx:73`), então `requireBusinessId` — que lançaria
`ForbiddenError` para um usuário sem `businessId` — nunca é alcançado por um SUPERADMIN.
Todas as rotas que o chamam são `authorize(ADMIN)` ou `authorize(EMPLOYEE)`. O trabalho
aqui é substituir o stub, não consertar uma exceção.

Criar negócio já funciona pela API (`POST /businesses`), mas só via curl: não há tela.

## Escopo

Painel **operacional**, decidido em brainstorming: serve para cadastrar negócios e
destravar convites parados, não para analisar crescimento da plataforma. Com um punhado
de negócios, uma série temporal de "negócios criados por mês" é um gráfico de uma barra.

Entra:

1. Quatro contadores globais: negócios, colaboradores, administradores, convites pendentes.
2. Tabela de negócios com contagem de equipe e status do convite do admin.
3. Criar negócio por formulário, consumindo o `POST /businesses` que já existe.
4. Reenviar o convite de um admin que ainda não aceitou.

Fora, por decisão explícita:

- Paginação, busca e filtro na tabela — código morto no volume atual.
- Gráfico de crescimento / série temporal.
- Página de detalhe de um negócio.
- `PUT /businesses/:id` e a tela de configurações do dono.
- SUPERADMIN enxergar o dashboard de ocupação/receita de um tenant. Exigiria afrouxar o
  `authorize(ADMIN)` de `/dashboard/overview` e passar `businessId` por parâmetro — uma
  decisão de segurança que não se paga agora.

## Decisões de arquitetura

### A. As rotas estendem `/businesses`, sem namespace por papel

```
GET  /businesses                      (SUPERADMIN)   novo
POST /businesses                      (SUPERADMIN)   já existe
POST /businesses/:id/resend-invite    (SUPERADMIN)   novo
```

Um namespace `/superadmin/*` seria o único prefixo nomeado por papel na API e produziria
a incoerência de `POST /businesses` conviver com `GET /superadmin/businesses`. O PRD já
trata `/businesses` como recurso compartilhado entre papéis (`GET /businesses/:slug`
público, `PUT /businesses/:id` para ADMIN). Autorização é responsabilidade do
`preHandler`, não do path.

Sem colisão: as rotas públicas moram sob `/public/*`
(`server/src/routes/publicRoutes.ts:65`), então `/businesses` está livre.

Os contadores **não ganham endpoint próprio**. `GET /businesses` devolve
`{ totals, businesses }` — mesma leitura, calculados por função pura no servidor. Um
endpoint, uma ida ao servidor, e os números não podem divergir da tabela.

### B. A UI é renderização condicional em `web/app/dashboard/page.tsx`

Aquele arquivo já é um roteador por papel. Passa a ser:

```
SUPERADMIN → <PlatformOverview />       novo
!isAdmin   → <PlaceholderOverview />    sobra só para EMPLOYEE
ADMIN      → dashboard atual
```

Sem rota nova e sem item de menu novo: o menu já dá "Visão geral" → `/dashboard` para
SUPERADMIN. Uma rota separada só se pagaria se o superadmin fosse ganhar várias telas;
com "tabela e só", seria um clique a mais até o único destino possível, e promover depois
é mover um arquivo.

`page.tsx` já tem 153 linhas de lógica de admin, então `PlatformOverview` mora em
componente próprio com o próprio fetch.

### C. Agregação: três queries flat + merge em função pura

`_count` filtrado não resolve — o Prisma aceita um filtro por relação em cada chave de
`_count`, e são necessários três recortes dos mesmos `users` (EMPLOYEE, ADMIN, convite
pendente). E convite pendente não pode ser contagem: o botão de reenvio precisa do
`userId`.

```ts
Promise.all([
  prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true, createdAt: true },
  }),

  prisma.user.groupBy({
    by: ["businessId", "role"],
    where: { businessId: { not: null } },
    _count: { _all: true },
  }),

  prisma.user.findMany({
    where: { businessId: { not: null }, password: null },
    select: { id: true, name: true, email: true, role: true, businessId: true },
  }),
]);
```

Três queries fixas, independentes da quantidade de negócios. `password === null` como
sinal de convite pendente é a convenção que o código já usa
(`server/src/services/dashboardService.ts:76`). Nenhum hash de senha sai do banco.

Descartada: `include: { users: { select: { role, password } } }` — uma query só, mas puxa
toda linha de usuário da plataforma e traz hash de senha para a memória do serviço.
Degrada exatamente na dimensão que o painel existe para medir.

O `where: { businessId: { not: null } }` exclui de propósito o ADMIN órfão que o seed
cria (`convite-teste@timeflow.com`, `server/prisma/seed.ts:31`): ele não pertence a
negócio nenhum e não pode inflar contagem de ninguém.

## Contrato da API

### `GET /businesses`

`preHandler: [authenticate, authorize(Role.SUPERADMIN)]`. Sem querystring.

```jsonc
{
  "totals": { "businesses": 4, "employees": 11, "admins": 4, "pendingInvites": 2 },
  "businesses": [
    {
      "id": 3,
      "name": "Barbearia do Zé",
      "slug": "barbearia-do-ze",
      "createdAt": "2026-07-20T14:03:11.000Z",
      "employees": 3,
      "admins": 1,
      "pendingInvites": [
        { "id": 12, "name": "Zé", "email": "ze@x.com", "role": "ADMIN" }
      ]
    }
  ]
}
```

`createdAt` em ISO 8601; a formatação para pt-BR é do front. Negócios ordenados por
`createdAt` decrescente — o recém-criado aparece no topo, que é o que o superadmin acabou
de fazer.

### `POST /businesses/:id/resend-invite`

`preHandler: [authenticate, authorize(Role.SUPERADMIN)]`.
Body: `{ "userId": 12 }`, schema com `additionalProperties: false`.

Gera token novo com `generateInviteToken()`, envia via `sendInviteEmail` e **só então**
persiste `inviteToken` e `inviteTokenExpiresAt`. O token anterior morre — desejável:
reenviar deve invalidar um link que pode estar num inbox errado.

**A ordem importa.** Persistir antes de enviar significa que, se o envio falhar, o link
antigo do admin já morreu e nenhum novo chegou: o convite fica irrecuperável sem
intervenção no banco. Enviando primeiro, uma falha de envio deixa o estado intacto e o
link antigo continua válido. O caso inverso (envio ok, escrita falha) entrega um link
morto, mas é recuperável — basta clicar em reenviar de novo.

Respostas:

| Situação                                     | Status | Como                                       |
| -------------------------------------------- | ------ | ------------------------------------------ |
| Reenviado                                     | 200    |                                            |
| `userId` não existe ou não pertence ao `:id`  | 404    | `NotFoundError`                            |
| Convite já aceito (`password !== null`)       | 409    | `ConflictError`                            |
| Falha no envio do e-mail                      | 502    | `new AppError("Could not send the invite email", 502)` |

Mensagens de erro do servidor ficam em inglês, como o resto de `errors.ts`; a tradução é
do front.

**Divergência deliberada de `createBusiness`:** aquele engole falha de envio e loga
(`server/src/services/businessService.ts:60`), porque o negócio já foi criado e derrubar
tudo seria pior. No reenvio não há nada criado para preservar, e responder 200 sem ter
enviado é mentir para quem clicou — a falha propaga.

## Camadas no servidor

```
businessRoutes.ts      2 rotas novas, schemas com additionalProperties: false
businessController.ts  2 handlers finos, zero lógica
businessService.ts     listBusinesses(), resendInvite(businessId, userId)
platformRules.ts       PURO: buildBusinessRows() + buildPlatformTotals()      novo
businessRepository.ts  findAll()
userRepository.ts      countByBusinessAndRole(), findPendingInvites(), resetInviteToken()
```

`listBusinesses()` dispara as três queries em `Promise.all` e entrega o resultado cru para
`platformRules`, que não importa Prisma. É o mesmo formato de `dashboardRules.ts`: as
regras ficam isoladas do acesso a dados e testáveis sem banco.

## Front

```
web/app/dashboard/page.tsx                       branch SUPERADMIN
web/components/dashboard/platform-overview.tsx   fetch + tiles + orquestração
web/components/dashboard/business-table.tsx      tabela sm+ / cards abaixo de sm
web/components/dashboard/create-business-dialog.tsx
web/components/dashboard/platform-tiles.tsx      os quatro cartões
web/lib/platform.ts (+ .test.ts)                 tipos + slugify(), businessStatus()
```

Tipos e helpers moram no mesmo módulo, seguindo `web/lib/dashboard.ts` — não em
`web/lib/types.ts`, que guarda só as entidades cruas da API.

**Tiles.** Quatro, no grid `sm:grid-cols-2 xl:grid-cols-4` que `kpi-cards.tsx` já usa:
Negócios cadastrados · Colaboradores · Administradores · Convites pendentes. O último é o
único acionável — quando `> 0`, ganha destaque em âmbar, porque é a única coisa da tela
que pede ação.

**Linha da tabela.** Negócio (nome, com `/slug` em texto secundário) · Equipe
(`3 colaboradores · 1 admin`) · Status (`Badge` "Ativo" ou "Convite pendente") · Criado em
· botão de reenvio, presente só quando há convite pendente.

**Mobile-first desde já**, conforme a regra do roteiro para as fases 2–4: abaixo de `sm`
cada negócio vira card empilhado, não tabela com scroll horizontal. Assim a Fase 5 não
retrabalha esta tela.

**Dialog de criar negócio.** Campos: Nome · Slug · Nome do admin · E-mail do admin. O slug
é auto-preenchido a partir do nome por `slugify` e continua editável; validado no cliente
contra o mesmo regex do schema da rota, `^[a-z0-9]+(-[a-z0-9]+)*$`. Ao concluir: fecha,
recarrega a lista, e o negócio novo aparece no topo.

Os dois `409` do servidor (`A business with this slug already exists`,
`A user with this email already exists`) chegam em inglês pelo `ApiError`; o front mapeia
para pt-BR, já que o resto da UI é em português.

## Estados e erros

Reaproveitam os padrões que `page.tsx` e `services/page.tsx` já estabeleceram: skeleton
dos quatro tiles durante o load, bloco de erro com botão "Tentar de novo" na falha de
lista, erro inline em `FieldError` no dialog, `Spinner` no botão durante o submit.

Empty state próprio — "Nenhum negócio cadastrado ainda", com CTA para o dialog. É o estado
real da base hoje.

Não entra aqui a correção de dialogs que não bloqueiam dismiss com request em voo: é item
do ticket de hardening e vale igualmente para services, team e schedule. Consertar só na
tela nova criaria inconsistência.

## Testes

Servidor, `node:test`, teste antes da implementação, no formato de
`dashboardRules.test.ts`:

`server/src/services/platformRules.test.ts`

- Negócio sem nenhum usuário resulta em zeros, não `NaN` nem `undefined`.
- Negócio com dois admins conta 2.
- Usuário com `businessId` nulo não entra em linha nenhuma.
- Convite pendente aparece na linha do negócio certo, com `id` e `email`.
- `totals` batem com a soma das linhas.
- Ordem `createdAt` decrescente preservada pelo merge.

Front, `node:test`, no formato de `web/lib/dashboard.test.ts`:

`web/lib/platform.test.ts`

- `slugify` com acento, espaço, símbolo, hífen duplicado, string vazia.
- `businessStatus(row): "pending" | "active"` — "pending" quando `pendingInvites` não é
  vazio, "active" caso contrário.

Verificação end-to-end antes de fechar, como é o default do projeto: `npm run typecheck`,
subir o servidor, `curl` do `GET` com token de superadmin, `curl` esperando 403 com token
de admin, criar negócio pela tela, reenviar convite, e conferir o layout nos dois
breakpoints.
