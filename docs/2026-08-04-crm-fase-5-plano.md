# CRM — Fase 5: autenticação de cliente e portal

**Status:** em andamento, passo 1 parcial
**Data:** 2026-08-04
**Documento base:** `2026-07-30-crm-architecture.md` (as referências §N abaixo são todas dele)
**Branch:** `feat/crm`

Este arquivo existe para que a fase 5 possa ser retomada sem re-derivar nada.
Ele registra três coisas: **as decisões tomadas**, **o estado exato do
código agora** e **o caminho passo a passo até o fim da fase**.

---

## 0. Onde a fase 5 começa

As fases 0 a 4 estão fechadas e no `origin/feat/crm`:

| Fase | Estado |
|---|---|
| 0 — `Booking.businessId` + `priceAtBooking` | shipada |
| 1 — schema do CRM | shipada |
| 2 — identidade na reserva | shipada |
| 3 — backfill histórico | shipada |
| 4 — CRM voltado ao negócio (7 passos) | shipada, último commit `05bec16` |

A fase 5 é a primeira com **autenticação nova exposta à internet**. É a razão
de o §8 exigir que o trabalho de rate limit (§11.6) venha **antes**, não depois.

---

## 1. Decisões tomadas em 2026-08-03

Estas três estavam em aberto no §17 e foram decididas. Não reabrir sem motivo
novo — cada uma já tem consequência escrita no plano abaixo.

### 1.1 Rate limit: contadores no Postgres (não Redis)

§11.6 pedia Redis "ou contadores no Postgres se adicionar Redis for
inaceitável". Escolhido Postgres: o banco já está no stack (Railway), o volume
atual não paga um serviço novo, e a propriedade que faltava — sobreviver a
restart e enxergar outra instância — o Postgres entrega igual.

### 1.2 Portal em `/conta` no app atual, cookie `SameSite=None`

**Achado técnico que muda o §5.2.** O documento especifica o cookie de refresh
como `httpOnly; Secure; SameSite=Lax`. Isso não funciona no deploy atual: o web
está na Netlify e a API no Railway, **domínios registráveis diferentes**. Um
cookie `Lax` não é enviado em requisição cross-site, então o refresh nunca
chegaria à API.

Consequências que o passo 3 tem que absorver:

- o cookie vai como `SameSite=None; Secure` (obrigatoriamente `Secure`, inclusive em dev com HTTPS local ou o cookie é descartado);
- o CORS precisa de `credentials: true` e origem explícita — `*` é proibido com credenciais (ver `config/cors.ts`, que hoje já usa lista de origens);
- `SameSite=None` **remove** a proteção CSRF que o `Lax` daria de graça. Precisa de defesa explícita: token CSRF de dupla submissão na rota de refresh, ou exigir um header custom (`X-Requested-With`-style) que só XHR same-origin consegue mandar. Escolher no passo 3 e testar dos dois lados.

Se um dia a API e o web ficarem sob o mesmo domínio registrável
(`api.dominio.com` + `app.dominio.com`), dá para voltar a `Lax` e apagar a
defesa CSRF extra. Registrar como dívida.

### 1.3 Sem SMS na v1 — só e-mail

Recomendação do próprio §17.1. A de-dup por telefone verificado (§4.1 passo 3)
continua em código e **inerte**: nada seta `phoneVerifiedAt`.

**Ressalva que a fase 3 descobriu e que pesa aqui:** nenhuma das 177 reservas
históricas tem e-mail (0 de 177 — `clientEmail` é opcional e ninguém preenche).
O histórico inteiro é chaveado por telefone. Logo, **o fluxo de claim (passo 6)
não vai ter praticamente nada a oferecer no começo** — ele só passa a valer
conforme reservas novas com e-mail entram. Isso não invalida o passo 6, mas
significa que o valor dele é futuro, e que ele **não** deve ser priorizado
acima dos passos 3 e 4.

---

## 2. Estado do código agora (importante ler antes de continuar)

Há trabalho **não commitado** na árvore, e uma migration **já aplicada no banco
de desenvolvimento**:

```
 M server/prisma/schema.prisma
?? server/prisma/migrations/20260804000000_add_shared_rate_limiting/
```

O que já foi feito do passo 1:

- modelos `RateLimitCounter` e `AuthLockout` adicionados ao `schema.prisma`, com os comentários explicando janela fixa e falhas consecutivas;
- migration `20260804000000_add_shared_rate_limiting` escrita à mão pelo processo canônico do §8.0 (gerada com `migrate diff`, cabeçalho explicativo, `IF NOT EXISTS` nos índices);
- `prisma migrate deploy` aplicado no banco local, `prisma generate` rodado;
- **drift verificado: `migrate diff` responde "This is an empty migration."**

O que **não** foi feito: nenhuma linha de TypeScript. O limitador em memória
continua sendo o único em uso, e nada lê as duas tabelas novas.

> Retomar por aqui. As tabelas existirem sem leitor é inofensivo — é DDL puro,
> e o rollback é `DROP TABLE` nas duas.

---

## 3. Os oito passos

Convenção do projeto, mantida da fase 4: **um commit por passo**, cada um
verificado antes de seguir (`prisma validate`, `tsc --noEmit`, unit,
integration, e `migrate diff` vazio quando houver migration). Pausa entre
passos.

### Passo 1 — Limitação de abuso compartilhada (§11.6) — *parcial*

Pré-requisito declarado da fase. Nada do passo 3 sobe sem ele.

**Falta fazer:**

1. `src/repositories/rateLimitRepository.ts` — o SQL atômico (desenho abaixo).
2. Reescrever `src/lib/rateLimit.ts`: a interface `RateLimiter.hit` vira **async**.
3. Migrar os dois chamadores atuais — `authService.requestPasswordReset` e `contactService.submit` — para `await`. Ambos já são funções async, então a mudança é local.
4. Varredura de linhas vencidas: exportar `sweepExpired(now)` e chamar num `setInterval` em `src/server.ts` (**não** em `buildApp`, ou os testes ficam com timer pendurado; usar `.unref()`).
5. Testes.

**Desenho do contador — janela fixa, uma linha por chave.**

Janela deslizante exigiria uma linha por tentativa (é uma lista de timestamps).
A fixa cabe numa linha e num único statement atômico. O preço é a rajada de
borda (até 2x o limite na virada), que é o trade-off clássico e aceitável.

```sql
INSERT INTO "RateLimitCounter" ("key", "windowStartedAt", "count", "expiresAt")
VALUES ($key, $now, 1, $expires)
ON CONFLICT ("key") DO UPDATE SET
  "count" = CASE
    WHEN "RateLimitCounter"."windowStartedAt" <= $threshold THEN 1
    ELSE LEAST("RateLimitCounter"."count" + 1, $max + 1)
  END,
  "windowStartedAt" = CASE
    WHEN "RateLimitCounter"."windowStartedAt" <= $threshold THEN $now
    ELSE "RateLimitCounter"."windowStartedAt"
  END,
  "expiresAt" = CASE
    WHEN "RateLimitCounter"."windowStartedAt" <= $threshold THEN $expires
    ELSE "RateLimitCounter"."expiresAt"
  END
RETURNING "count"
```

- `$threshold = $now - windowMs`. A janela venceu quando `windowStartedAt <= threshold` — confere com o comportamento atual em memória, inclusive na borda exata (`now + windowMs` já libera).
- `limited = count > max`. O `LEAST(..., max + 1)` é o que torna isso correto **e** limita o crescimento: uma chave martelada satura em `max + 1` em vez de subir sem teto.
- Um round trip, atômico, sem retry.

> **Atenção ao mudar o teste existente.** `rateLimit.test.ts` tem hoje o teste
> *"a tentativa bloqueada não estende a punição"*, escrito contra a
> implementação deslizante — lá, contar a tentativa bloqueada empurrava a janela
> para frente. Na janela fixa isso **não** acontece: o fim da janela é
> `windowStartedAt + windowMs` e não se move com a contagem. O teste tem que ser
> reescrito para afirmar a propriedade certa (*o fim da janela não se move*), e
> não simplesmente apagado — a propriedade continua valendo, muda o mecanismo.

**Desenho do bloqueio progressivo (§11.6, "per-customer lockout with
exponential backoff, separate from the per-IP limit").**

São controles diferentes de propósito: o limite por IP contém quem varre muitas
contas de um lugar só; o lockout contém o ataque distribuído contra **uma**
conta, que passa por baixo de qualquer limite por IP.

Math puro, unit-testável, em `lib/rateLimit.ts`:

```ts
export function lockoutDelayMs(failures: number, o: LockoutOptions): number | null {
  if (failures <= o.threshold) return null;          // ainda dentro da tolerância
  return Math.min(o.baseMs * 2 ** (failures - o.threshold - 1), o.maxMs);
}
```

Persistência numa transação, para não perder incremento sob concorrência:
incremento atômico via `INSERT ... ON CONFLICT` retornando `failures`, cálculo
puro em TS, `UPDATE` do `lockedUntil`. Falhas são **consecutivas**: o login
bem-sucedido **apaga a linha** (`clearFailures`), senão quem erra a senha uma
vez por semana acabaria bloqueado por acumulação.

**Chaves:** namespace em claro + identificador em `sha256`
(`"login:" + sha256(email)`). O namespace em claro mantém a linha diagnosticável
por tipo; o hash evita que um dump da tabela vire lista de quem tentou entrar —
e-mail e IP são dado pessoal.

**Testes:**
- unit: `lockoutDelayMs` (tolerância, dobra, teto), montagem de chave;
- integração: N hits em paralelo com `max = M` liberam exatamente M (é o ponto da atomicidade — o teste que justifica ter saído da memória); janela reabre; chaves não se misturam; lockout dobra e o acerto zera; sweep remove vencidas e não toca nas vigentes.

---

### Passo 2 — Token de cliente + `authenticateCustomer` (§5.2)

Sem rota nova ainda. Só o mecanismo e a separação, que é a parte perigosa.

- `CustomerJwtPayload { sub, typ: "customer", ver }` como **interface irmã** de `JwtPayload`, não campos opcionais na mesma — é o que faz o TypeScript exigir a distinção em cada call site (§5.2).
- `authenticateCustomer` recusa qualquer token sem `typ === "customer"`; o `authenticate` atual recusa qualquer token **com** ele. As duas checagens explícitas.
- `ver` conferido contra `Customer.tokenVersion` — invalida todo access token sem consultar sessão no caminho quente.
- **Nunca** `businessId` no token de cliente (§15 armadilha 3).
- `Role` fica intocado. Não adicionar `CUSTOMER` ao enum (§15 armadilha 1).
- Flag própria: `CUSTOMER_AUTH_ENABLED`, default **desligado**, mesma polaridade e mesmo raciocínio do `CRM_ENABLED` (ligar autenticação nova tem que ser ato explícito).

> Esta é a fronteira onde uma checagem faltando é **escalação de privilégio
> completa**: token de cliente aceito numa rota de staff. Os testes têm que
> afirmar as duas direções, com token real assinado, e não confiar em tipo.

---

### Passo 3 — Rotas públicas de autenticação (§9.1)

Nove rotas sob `/public/customers/auth/`: `register`, `login`, `magic-link`,
`verify`, `refresh`, `logout`, `forgot-password`, `reset-password`.

Pontos que não podem ser esquecidos:

- **Respostas uniformes** (§11.2): `register`, `magic-link` e `forgot-password` sempre `202`, com o mesmo corpo, exista ou não o e-mail. `login` sempre `401` genérico — senha errada, e-mail desconhecido, suspenso e não verificado dão a mesma resposta. A informação diferenciadora vai pelo canal de e-mail, nunca pelo HTTP.
- **Timing:** hash dummy quando o cliente não existe, senão o tempo de resposta vira o oráculo que a resposta uniforme tentou fechar.
- **Contador de rate limit incrementado ANTES** do trabalho caro (hash, envio de e-mail) — §6.
- **Rotação de refresh com detecção de replay** (§5.2): a rotação revoga a linha antiga e a nova aponta para trás via `replacedById`; apresentar um refresh já rotacionado revoga **a família inteira**. É a única defesa real contra cookie roubado.
- **Cookie:** `httpOnly; Secure; SameSite=None` + CORS com credenciais + a defesa CSRF explícita da decisão 1.2.
- `CustomerVerification`: código de 6 dígitos só para SMS (que não existe na v1) — aqui usar **link mágico de 128 bits**, que é o que o §11.3 prefere quando a UX permite. Expiração de 10 min, `attempts` com corte em 5, um código ativo por (cliente, propósito), consumo dentro de transação.
- `destination` capturado no envio e reconferido no resgate (§11.11).

---

### Passo 4 — Rotas do cliente autenticado (§9.2)

`GET/PATCH /customer/me`, `POST /customer/me/password`,
`GET/DELETE /customer/sessions[/:publicId]`, `GET /customer/businesses`,
`GET /customer/businesses/:slug/bookings`,
`GET /customer/businesses/:slug/loyalty`, `DELETE /customer/me` (§11.8).

- **Escopo por caminho, sempre.** Não criar `GET /customer/bookings` que devolva tudo: seria o único lugar do sistema onde dois negócios sentam no mesmo payload, e está a um reuso de serializer de virar vazamento no lado do negócio (§15 armadilha 4).
- Sessões endereçadas por `publicId` — o id é `BigInt` e não pode ser serializado.
- Erasure (§11.8) apaga a **identidade** e pseudonimiza o prontuário, mas preserva `Booking` e o histórico monetário. A resposta da API tem que dizer explicitamente o que ficou.

---

### Passo 5 — Reserva pública com bearer opcional (§7, §16.2, §16.4)

`POST /public/businesses/:slug/bookings` ganha `Authorization` opcional e os
campos opcionais `createAccount` e `idempotencyKey`.

- **O caminho de convidado tem que continuar byte por byte o que é hoje.** É o contrato de compatibilidade da fase inteira.
- Autenticado: identidade vem do token, resolução por canal é pulada por completo. Se não existe prontuário naquele negócio, cria — **é essa a operação de "vincular um negócio", e ela é implícita** (§7). Sem tela de consentimento: o que precisaria de consentimento é dado indo na direção contrária, e não vai.
- Ordem na transação não muda: identidade **antes** do claim do horário, para trabalho de identidade nunca ser a causa de horário perdido.
- `idempotencyKey` fecha o duplo-toque em conexão ruim (a coluna e o unique já existem desde a fase 1).

---

### Passo 6 — Claim + merge (§4.3, §6C, §16.5)

`GET /customer/claims`, `POST /customer/claims/:id/confirm`,
`POST /customer/claims/:id/redeem`.

- Claim é **por negócio** e nunca em lote: um e-mail digitado errado não pode entregar o histórico de quatro negócios.
- O merge é a **única operação destrutiva** do CRM. `CustomerMergeLog` é obrigatório, e o gatilho append-only que o protege já existe desde a fase 1.
- Caso destrutivo de verdade: o vencedor **já** tem prontuário naquele negócio. Aí move reservas/notas/pontos, **recomputa** os agregados a partir das linhas movidas (não incrementa) e apaga o prontuário perdedor, com `profilesCollapsed = true` no log.
- Perdedor fica: `mergedIntoId`, canais nulados, senha nula, `tokenVersion + 1`, sessões revogadas.
- Lembrar da ressalva 1.3: com 0 e-mails históricos, este passo entrega pouco valor imediato. Fazer depois de 3, 4 e 5.

---

### Passo 7 — Portal `/conta` (§10)

Telas: login, cadastro, verificação, esqueci/redefinir senha, reservas por
negócio, seletor de negócio, saldo de fidelidade, perfil, sessões, claims.

- **Dois armazenamentos de token, dois adapters, nenhum cliente HTTP compartilhado** (§15 armadilha 9). Criar `web/adapters/customerFetchAdapter.ts` separado do `fetchAdapter` atual. Um wrapper "que anexa o token" é exatamente como um token de cliente acaba numa rota de staff.
- Access token só em memória; refresh no cookie `httpOnly`.
- Identidade visual distinta do painel, para ninguém confundir os dois.

---

### Passo 8 — "já tenho conta" na página pública (§10)

Afordância opcional no passo de contato de `web/app/[slug]`.

- Convidado continua sendo o padrão e o caminho mais rápido, **para sempre**.
- **O convite de login não pode ficar entre o visitante e o seletor de horário** (§15 armadilha 15). Um CRM que derruba conversão de reserva é prejuízo líquido.

---

## 4. Ordem, e o que dá para paralelizar

```
1 (rate limit)  →  2 (token)  →  3 (auth pública)  →  4 (rotas do cliente)  →  5 (reserva com bearer)
                                                                                      ↓
                                                                              6 (claim + merge)
                                        7 (portal) depende de 3 e 4; 8 depende de 3
```

O passo 1 é bloqueante de verdade: o §8 diz que a fase 5 sobe "com o trabalho
de rate limit feito antes, não depois".

---

## 5. Portões de qualidade por passo

Iguais aos da fase 4, que seguraram bem:

- `npx prisma validate` e `migrate diff` vazio quando houver migration;
- `npx tsc --noEmit` nos dois lados;
- `npm test` e `npm run test:integration` no servidor — hoje **222 unit + 136 integration**;
- `npm test`, `npm run typecheck` e `npm run build` no web — hoje **120 unit**;
- `npm run lint` no web tem **2 erros pré-existentes** em `app/landing-header.tsx` (`react-hooks/set-state-in-effect`), alheios ao CRM. Não confundir com regressão — e vale limpar em algum momento.

---

## 6. Armadilhas específicas desta fase

Recorte do §15, só o que a fase 5 pode quebrar:

1. Adicionar `CUSTOMER` ao enum `Role` — transforma todo `authorize()` numa lista de negação e colide com `businessId: null` do superadmin.
2. `businessId` no token de cliente — o conjunto de negócios é ilimitado e muda; o token nasce velho.
3. `GET /customer/bookings` unificado — manter a união fora da API.
4. Fazer upsert de cliente por e-mail **não verificado** — §11.1, o atalho mais perigoso disponível, é takeover de conta.
5. Reservas bloqueando em e-mail de verificação — a reserva é o evento de receita e tem que sobreviver a uma queda do Resend.
6. Cliente HTTP compartilhado no frontend.
7. Merge sem log.

---

## 7. Dívidas registradas, a resolver fora da fase 5

- **`SameSite=None` + CSRF explícito** — some se API e web ficarem sob o mesmo domínio registrável (decisão 1.2).
- **`normalizePhoneE164` é só Brasil** — trocar por `libphonenumber-js` quando chegar SMS ou negócio fora do país (§17.9).
- **`BookingStatus` não existe** — bloqueia acrual automático de fidelidade e mantém `completedCount`/`noShowCount`/`canceledCount` em zero e `totalSpent` como valor *reservado*, não liquidado (§17.7).
- **`resetDatabase` com ordem de FK à mão** — trocar por `TRUNCATE ... CASCADE` só depois da fase 6 (§17.8).
- **Ids `Int` em `Availability`/`Booking`/`LoyaltyEntry`** — fase própria, no horizonte do §14.1.
