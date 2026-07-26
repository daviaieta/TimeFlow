# Tela de configurações — design

**Data:** 2026-07-26
**Fase do roteiro:** Fase 2, segunda metade. A primeira (painel do SUPERADMIN) está na
`feat/superadmin-panel`, de onde esta branch sai.

## Problema

Ninguém consegue mudar o próprio nome, e-mail ou senha depois de aceitar o convite, e
nenhum ADMIN consegue editar os dados do próprio negócio. `PUT /businesses/:id` está no
PRD (linha 384) e nunca foi implementado. Um negócio cadastrado com o nome errado fica
errado.

Endereço não existe no modelo: `Business` tem `id`, `name`, `slug`, `createdAt`,
`updatedAt` e nada mais.

## Decisões

### Endereço é uma linha de texto livre

`address String?` — o dono escreve como quiser. A alternativa estruturada (rua, número,
bairro, cidade, UF, CEP) permitiria link de mapa e filtro por cidade, mas nenhuma feature
atual consome isso, e são sete inputs numa tela que precisa ser simples. Nullable porque
todo negócio existente nasce sem endereço e nem todo negócio tem ponto físico.

### Trocar e-mail ou senha exige a senha atual; trocar o nome, não

O e-mail é o identificador de login e é `@unique`. Não existe recuperação de senha no
sistema, então um erro de digitação no e-mail tranca a conta — só o superadmin destrava,
indo no banco. A senha atual barra quem encontrou uma sessão aberta e força atenção no
momento em que se mexe no login.

Corrigir um typo no próprio nome não paga esse pedágio: é dado de exibição, não de acesso.
Isso torna a exigência condicional, e a condição vive numa função pura testável, não
espalhada no controller.

Descartada a verificação por e-mail (link de confirmação para o endereço novo): é a única
proteção real contra o erro de digitação, mas exige campos de token no `User`, endpoint de
confirmação, página nova e um estado "troca pendente" na UI — vira uma feature maior que o
resto desta tela somada.

### Trocar o slug quebra os links antigos, e está tudo bem

O slug é a URL pública da vitrine. Trocar mata qualquer link já divulgado. Manter os slugs
antigos vivos por redirect exigiria histórico em tabela ou coluna, lookup na rota pública,
e uma decisão sobre o que fazer quando outro negócio pedir um slug abandonado.

A tela mostra a URL inteira montada e avisa explicitamente que links já divulgados vão
parar de funcionar. A responsabilidade fica com quem troca, que é quem conhece a própria
divulgação.

### O `:id` da URL não pode virar uma forma de editar o negócio alheio

`PUT /businesses/:id` mantém o `:id` por fidelidade ao PRD, mas o service exige
`id === request.user.businessId` e devolve 403 caso contrário. É o invariante central do
sistema — "toda ação de ADMIN e EMPLOYEE deve ser restrita ao `businessId` ao qual o
usuário pertence" (PRD, seção 6) — e o único jeito de o `:id` na rota ser seguro.

## Schema

```prisma
model Business {
  id        Int      @id @default(autoincrement())
  name      String
  slug      String   @unique
  address   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ...
}
```

Migration: `add_address_to_business`. Uma coluna, nullable, sem backfill.

`userRepository.findByIdWithBusiness` passa a selecionar `address` no `business`, para que
`GET /auth/me` alimente o formulário sem uma segunda requisição. O tipo `AuthUser` em
`web/lib/auth.ts` ganha o campo.

## Endpoints

### `PUT /auth/me`

`preHandler: [authenticate]`. Qualquer papel.

```jsonc
// requisição
{ "name": "José da Silva", "email": "jose@x.com", "currentPassword": "..." }
```

`name` e `email` são obrigatórios com `minLength: 1` — o formulário sempre envia os dois,
preenchidos com os valores atuais, então "não mexi nesse campo" chega como o valor de
antes, não como ausência.

`currentPassword` é opcional no schema e obrigatório **apenas quando o e-mail muda** —
regra aplicada no service, não no schema, porque JSON Schema não expressa "obrigatório se
outro campo divergir do estado atual" sem contorcionismo.

Responde com o mesmo formato de `GET /auth/me`, para o cliente atualizar o contexto sem
uma segunda ida ao servidor.

| Situação | Status |
| --- | --- |
| Atualizado | 200 |
| E-mail mudou e `currentPassword` ausente | 400 `BadRequestError` |
| `currentPassword` incorreta | 401 `UnauthorizedError` |
| E-mail já usado por outro usuário | 409 `ConflictError` |

### `PUT /auth/me/password`

`preHandler: [authenticate]`. Qualquer papel.

```jsonc
{ "currentPassword": "...", "newPassword": "..." }
```

`newPassword` com `minLength: 8`, igual ao schema de `accept-invite`. Responde 204.

| Situação | Status |
| --- | --- |
| Trocada | 204 |
| `currentPassword` incorreta | 401 |
| Usuário sem senha definida (convite não aceito) | 401 |

O token atual continua válido: o JWT carrega `sub`, `role` e `businessId`
(`server/src/interfaces/auth.ts`), nada derivado da senha. Invalidar sessões é assunto de
outra entrega.

### `PUT /businesses/:id`

`preHandler: [authenticate, authorize(Role.ADMIN)]`.

```jsonc
{ "name": "Barbearia do Zé", "slug": "barbearia-do-ze", "address": "Rua X, 123" }
```

`address` aceita `null` para limpar. `slug` valida contra o mesmo
`^[a-z0-9]+(-[a-z0-9]+)*$` que `POST /businesses` usa.

| Situação | Status |
| --- | --- |
| Atualizado | 200 |
| `:id` diferente do `businessId` do usuário | 403 `ForbiddenError` |
| Negócio não existe | 404 |
| Slug já usado por outro negócio | 409 |

O 403 vem antes de qualquer leitura do negócio alvo: responder 404 para um id que existe
mas não é seu vazaria a existência de outros negócios.

## Web

```
web/app/dashboard/settings/page.tsx    a tela, três cartões
web/app/dashboard/layout.tsx           item "Configurações" na sidebar + contexto
web/app/dashboard/auth-context.tsx     passa a prover { user, refresh }
web/lib/auth.ts                        AuthUser.business ganha address
```

Três cartões, no idioma visual de `services/page.tsx`: **Seus dados** (nome, e-mail, e o
campo de senha atual que aparece quando o e-mail muda), **Senha** (atual, nova), e — só
para ADMIN — **Seu negócio** (nome, slug, endereço).

O cartão do negócio mostra a URL pública montada a partir do slug digitado, com o aviso de
que trocar quebra links já divulgados.

O item "Configurações" aparece para os três papéis: todo mundo tem nome e senha. O cartão
do negócio é o que é condicionado a ADMIN.

### O contexto precisa poder ser recarregado

Hoje `AuthUserProvider` recebe um `AuthUser` imutável e o layout busca `/auth/me` uma vez
na montagem (`web/app/dashboard/layout.tsx:73`). Salvar o nome mudaria o banco e deixaria a
sidebar exibindo o valor antigo até um F5.

A busca sai do corpo do efeito para um `useCallback`, e o contexto passa a prover
`{ user, refresh }`. A tela de configurações chama `refresh()` depois de cada salvamento.
`useAuthUser()` continua devolvendo só o usuário, então nenhuma tela existente muda.

Atenção ao lint: o projeto trata `react-hooks/set-state-in-effect` como erro, e
`web/app/dashboard/page.tsx` já resolve esse padrão com `useTransition` — o refactor do
layout não pode reintroduzir um `setState` síncrono dentro do efeito.

## Testes

Regras puras, `node:test`, teste antes da implementação, no formato de
`dashboardRules.test.ts`:

- `normalizeEmail(raw)` — `trim()` + `toLowerCase()`.
- `requiresCurrentPassword(currentEmail, nextEmail)` — recebe os dois e-mails **já
  normalizados** e devolve boolean. Pede senha quando divergem; não pede quando são
  iguais; não pede quando o usuário reenvia o mesmo e-mail com espaços ou caixa diferente
  (` Jose@X.com ` contra `jose@x.com` não é uma troca).

O service normaliza antes de comparar, antes de checar unicidade e antes de gravar.

**Gap pré-existente que esta entrega NÃO resolve:** `User.email` é `String @unique` em
Postgres, que compara com sensibilidade a maiúsculas. Um usuário gravado como
`Jose@X.com` por convite e outro que salve `jose@x.com` por esta tela passam os dois pela
constraint. A normalização aqui impede que a tela *crie* variantes novas, mas não corrige
o que já está no banco nem o `findByEmail` do login, que faz match exato. Migrar a coluna
para `citext` ou baixar a caixa de todos os registros é uma entrega própria.

Verificação por curl, cobrindo os caminhos de erro:

- senha atual errada em ambos os endpoints;
- e-mail já usado por outro usuário;
- slug já usado por outro negócio;
- **ADMIN autenticado tentando `PUT /businesses/:id` de outro negócio → 403.** Este é o
  teste que não pode falhar; um regression aqui é vazamento entre tenants.
- EMPLOYEE tentando o mesmo endpoint → 403 pelo `authorize`.

## Fora de escopo

Recuperação de senha · verificação do e-mail novo por link · invalidação de sessões após
troca de senha · upload de avatar · redirect de slugs antigos · exibir o endereço na
vitrine pública (a vitrine vive na `feat/public-showcase`; mexer nela aqui criaria conflito
de merge por uma linha).
