# System Design — Booking SaaS

> Documento de arquitetura da V1. Fontes de verdade: `PRD.md` (principal), `TASKS.md` (complementar)
> e o código existente. Conflitos entre as três fontes estão destacados como **⚠️ Conflito**.

---

## 1. Visão Geral

Booking SaaS é uma API REST multi-tenant de agendamentos para negócios de serviço
(barbearias, salões, consultórios). Cada `Business` opera isolado dentro da mesma
aplicação e do mesmo banco, com seus próprios usuários, serviços e agenda.

**Estado atual da implementação** (Fase 1 do `TASKS.md` parcialmente concluída):

- Servidor Fastify com error handler centralizado (`src/server.ts`, `src/lib/errors.ts`).
- Helper de hash de senha com bcrypt (`src/lib/password.ts`).
- Schema Prisma migrado (PostgreSQL via Docker) com todos os modelos da V1.
- Estrutura de camadas criada, ainda vazia (`routes/`, `controllers/`, `services/`,
  `repositories/`, `interfaces/`).

**Stack** (PRD §13): Node.js, TypeScript, Fastify 5, Prisma 6, PostgreSQL 16 (Docker),
MongoDB (log de notificações), JWT, bcrypt, `@fastify/websocket`, Resend/Nodemailer,
`@fastify/multipart`, `node:test`.

---

## 2. Arquitetura Geral

Arquitetura em camadas (PRD §7), num único processo Node.js (monolito modular):

```
Cliente (HTTP / WebSocket)
  ↓
Fastify  ── setErrorHandler (tratamento centralizado de erros)
  ↓
Routes   ── JSON Schema (validação de entrada) + hooks de auth/authz
  ↓
Controllers ── traduz HTTP ↔ domínio; sem regra de negócio
  ↓
Services    ── regras de negócio, autorização por businessId, orquestração
  ↓
Repositories ── acesso a dados; único lugar que toca o Prisma
  ↓
Prisma ORM
  ↓
PostgreSQL (Docker)
```

**Por que camadas e não outra topologia:** o PRD define explicitamente esse padrão
(§7 e §10 — "Arquitetura em camadas") e o projeto é declaradamente um estudo de
arquitetura backend sobre um boilerplate existente. Microsserviços ou event-driven
estariam fora do escopo.

**Camadas transversais** (PRD §7):

- **Middleware de autenticação (JWT)** — hook `preHandler` do Fastify que valida o
  token e injeta `user` (id, role, businessId) na request. (Task 1.4)
- **Middleware de autorização** — hook que valida `role` exigida pela rota e o
  escopo de `businessId`. (Task 1.5)
- **WebSocket** — canal por `businessId` para atualizar a client view em tempo real
  quando um slot é reservado (RF18).

**Persistência poliglota** (PRD §10): PostgreSQL é a única fonte de verdade dos dados
de negócio; MongoDB armazena apenas log de notificações/eventos (e-mails de convite e
confirmação enviados). Motivo declarado no PRD: objetivo de aprendizado de arquitetura
poliglota (§15), sem acoplar o fluxo transacional ao log.

---

## 3. Componentes e Responsabilidades

| Componente | Diretório | Responsabilidade |
| --- | --- | --- |
| Server bootstrap | `src/server.ts` | Instancia o Fastify, registra error handler, plugins e rotas |
| Routes | `src/routes/` | Declara endpoints, JSON Schemas de validação e hooks de auth/authz por rota |
| Controllers | `src/controllers/` | Extrai dados da request, chama o Service, formata a resposta HTTP |
| Services | `src/services/` | Regras de negócio: convites, escopo de tenant, criação de booking, disparo de e-mail/WS |
| Repositories | `src/repositories/` | Consultas Prisma; nenhuma regra de negócio |
| Middlewares | `src/middlewares/`* | Autenticação JWT e autorização por role/businessId |
| Lib | `src/lib/` | Infra compartilhada: `prisma.ts` (client singleton), `password.ts` (bcrypt), `errors.ts` (AppError e subclasses 401/403/404/409) |
| Interfaces | `src/interfaces/` | Tipos/contratos TypeScript entre camadas |
| WebSocket hub | (Fase 5) | Registro de conexões agrupadas por `businessId`; broadcast de eventos de reserva |
| Mailer | (Fase 5) | Envio de e-mails transacionais (Resend ou Nodemailer) |
| Notification log | (Fase 5) | Escrita de eventos de notificação no MongoDB |

\* A pasta `middlewares/` está prevista na Task 1.1 mas ainda não existe no filesystem —
apenas `routes`, `controllers`, `services`, `repositories`, `lib` e `interfaces` foram criadas.

**Módulos de domínio** (um conjunto route/controller/service/repository por agregado,
seguindo a ordem de dependência da Fase 3 das TASKS):

1. **Auth** — login e aceite de convite.
2. **Business** — criação (SUPERADMIN), leitura pública por slug, edição (ADMIN).
3. **Service** — CRUD pelo ADMIN, escopado ao business.
4. **Employee / EmployeeService** — convite, listagem, remoção e vínculo N:N com serviços.
5. **Availability** — CRUD do próprio colaborador.
6. **Booking** — reserva manual (EMPLOYEE) e reserva pública (client view).
7. **Client View** — rotas públicas `/app/:businessSlug/*`, somente leitura + criação de booking.

---

## 4. Fluxos do Sistema

### 4.1 Onboarding de um Business (RF02, RF04)

```
SUPERADMIN → POST /businesses
  → cria Business (nome, slug único)
  → cria User ADMIN vinculado ao business
  → dispara e-mail de convite com token
  → registra evento de e-mail no MongoDB
ADMIN → link do e-mail → POST /auth/accept-invite (token + senha)
  → senha hasheada (bcrypt) → conta ativa
ADMIN → POST /auth/login → JWT
```

### 4.2 Convite de Employee (RF03, RF08)

Igual ao fluxo do Admin, iniciado por `POST /employees` (ADMIN), criando `User` com
role `EMPLOYEE` no mesmo `businessId` do Admin. O vínculo com serviços é feito depois
via `POST /employees/:id/services` (RF09).

### 4.3 Reserva pública — fluxo principal (PRD §12)

```
Cliente acessa /app/:businessSlug
  → GET /app/:businessSlug/services                       (lista serviços)
  → GET /app/:businessSlug/services/:serviceId/availabilities
      (employees que oferecem o serviço + slots com isBooked = false)
  → POST /app/:businessSlug/bookings (nome, telefone, e-mail opcional)
      → Service valida que a Availability pertence ao business do slug e está livre
      → transação: cria Booking + marca Availability.isBooked = true
      → constraint @unique(availabilityId) garante que só uma reserva vence (RF15)
      → envia e-mail de confirmação se e-mail informado (RF17)
      → emite evento WebSocket no canal do businessId (RF18)
```

**Decisão — concorrência resolvida no banco, não na aplicação:** a checagem
"availability livre?" na aplicação é apenas fail-fast; a garantia real contra dupla
reserva é a constraint `@unique` em `Booking.availabilityId` (PRD §8, decisão já
tomada). Duas requisições simultâneas resultam em uma inserção bem-sucedida e um erro
de unicidade do Postgres, que o Service converte em `ConflictError` (409). E-mail e
WebSocket são efeitos colaterais executados **após** o commit — falha neles não pode
desfazer a reserva.

### 4.4 Reserva manual pelo Employee (RF13)

`POST /bookings` autenticado: mesmo núcleo transacional do fluxo público, com a
validação adicional de que a `Availability` pertence ao próprio employee logado.

### 4.5 Gestão de agenda (RF10–RF12)

CRUD de `Availability` sempre filtrado por `employeeId = user.id`. Duplicidade de slot
é bloqueada pela constraint `@@unique([employeeId, date, startTime])` (RF12), também
convertida em 409 na camada de Service.

---

## 5. Modelo de Dados

Schema implementado em `prisma/schema.prisma` (migração `20260708213712` aplicada):

```
Business 1 ── N User          (User.businessId opcional — SUPERADMIN não tem business)
Business 1 ── N Service
User (EMPLOYEE) N ── N Service   via EmployeeService (@@id composto)
User (EMPLOYEE) 1 ── N Availability
Availability 1 ── 0..1 Booking   (Booking.availabilityId @unique)
Service 1 ── N Booking
```

**Decisões de modelagem** (PRD §8 — já tomadas, não reabrir):

- **Sem tabela `Client`** — dados do cliente desnormalizados no `Booking`
  (`clientName`, `clientPhone`, `clientEmail?`). Motivo: YAGNI, V1 não tem histórico
  consolidado por cliente (PRD §5).
- **`Booking.availabilityId @unique`** — trava anti-corrida no nível do banco (RF15).
- **`@@unique([employeeId, date, startTime])`** em Availability — impede slot duplicado (RF12).
- **`User.businessId` nullable** — só para SUPERADMIN; para ADMIN/EMPLOYEE a camada de
  Service deve tratá-lo como obrigatório.
- **1 Booking = 1 Availability** — serviços multi-slot estão fora do escopo (PRD §5).

**⚠️ Conflito — `Service.price`:** o PRD (§8) define `price Float`; a implementação usa
`Decimal @db.Decimal(10, 2)`. A implementação é a que está migrada no banco. Divergência
deliberada ou não, o PRD está desatualizado neste ponto (o mesmo vale para os campos
`updatedAt` presentes em todos os modelos implementados, mas ausentes do PRD).

**⚠️ Conflito — convites sem suporte no schema:** RF02/RF03 e `POST /auth/accept-invite`
(Task 2.2) pressupõem um token de convite e um usuário "pendente de senha", mas o schema
implementado não tem modelo `Invitation`, nem campo de token/status no `User`, e
`User.password` é **obrigatório**. Não há como persistir o estado "convidado, sem senha"
com o schema atual. Precisa de decisão: modelo `Invitation` próprio, campos no `User`
(ex.: password nullable + inviteToken), ou token JWT stateless de convite.

**⚠️ Conflito — avatar sem suporte no schema:** RF19 (upload de avatar para
Admin/Employee) não tem campo correspondente (ex.: `User.avatarUrl`) no schema nem no
modelo do PRD §8. O destino do arquivo e a referência no banco não estão definidos.

**⚠️ Observação — derivação de tenant:** `Availability` e `Booking` não carregam
`businessId` direto; o tenant é derivado via join (`Availability → User.businessId`,
`Booking → Service.businessId`). É consistente com o modelo do PRD, mas obriga toda
checagem de autorização e todo broadcast de WebSocket a resolver o `businessId` por join.

---

## 6. Autenticação e Autorização

### Autenticação (RF01, Task 1.4)

- Login por e-mail/senha em `POST /auth/login`; senha comparada com hash bcrypt
  (salt rounds 10, já implementado em `src/lib/password.ts`).
- Resposta: JWT contendo no mínimo `sub` (userId), `role` e `businessId`.
  Motivo: autorização por role/tenant em toda rota (PRD §10) sem hit no banco por request.
- Middleware de autenticação como hook `preHandler`: valida assinatura/expiração e
  injeta `user` na request. Falha → `UnauthorizedError` (401, já existente em `errors.ts`).

### Aceite de convite (RF02/RF03, Task 2.2)

`POST /auth/accept-invite` recebe o token do e-mail e a senha escolhida, ativa a conta.
O mecanismo de persistência do token depende da resolução do conflito de schema
apontado na §5.

### Autorização (Task 1.5)

RBAC com três roles (PRD §6): `SUPERADMIN`, `ADMIN`, `EMPLOYEE`, mais acesso anônimo
às rotas públicas (`/app/:businessSlug/*`, `GET /businesses/:slug`).

Regra crítica (PRD §6): **toda ação de ADMIN/EMPLOYEE é restrita ao `businessId` do
usuário logado.** Aplicação em duas camadas:

1. **Middleware** — checa a role mínima da rota.
2. **Service** — checa a posse do recurso: recursos são sempre buscados **com filtro
   de tenant** (`businessId` do token) ou de dono (`employeeId` do token, no caso de
   Availability — RF11), nunca só pelo id. Recurso de outro tenant resulta em
   `NotFoundError`/`ForbiddenError`.

Motivo da dupla checagem: o middleware não conhece o dono do recurso alvo (só sabe o
id da URL); a checagem de posse exige consulta e por isso vive no Service — que é
também onde os testes de isolamento por tenant (Task 5.5) atacam.

Erros padronizados pelas classes existentes: 401 `UnauthorizedError`,
403 `ForbiddenError`, 404 `NotFoundError`, 409 `ConflictError`.

---

## 7. Multi-Tenancy

**Modelo: tenant compartilhado (shared database, shared schema), discriminado por
coluna `businessId`.** Motivo: é o modelo definido pelo PRD (§1 — "cada negócio opera
de forma isolada dentro da mesma aplicação"; §8 — FKs para `Business`), adequado ao
porte da V1 e ao objetivo de estudo (§15).

- **Identificação do tenant:**
  - Rotas autenticadas → `businessId` do JWT.
  - Rotas públicas → `slug` na URL (`/app/:businessSlug`), resolvido para `businessId`
    no Service. Slug é `@unique` no banco (RF06).
- **Isolamento:** garantido em código (filtros nos Repositories/Services), não em
  infraestrutura — não há schema por tenant nem Row-Level Security do Postgres. É a
  interpretação direta do PRD §10 ("toda rota autenticada deve validar role e
  businessId"); o custo é que o isolamento depende de disciplina de código, mitigado
  pelos testes de autorização exigidos na Task 5.5.
- **SUPERADMIN** é o único ator cross-tenant, e apenas para `POST /businesses` (PRD §6).
- **Limite explícito da V1:** um usuário pertence a no máximo um business (PRD §5).

---

## 8. Integrações Externas

### 8.1 E-mail transacional (RF02, RF03, RF17 — Task 5.2)

- Provedor: **Resend ou Nodemailer** (PRD §13 deixa os dois em aberto; decisão pendente
  na Fase 5).
- Três mensagens: convite de Admin, convite de Employee, confirmação de reserva ao
  cliente (somente se e-mail informado).
- Envio sempre **fora da transação** de banco: a criação do Business/Employee/Booking
  não pode falhar nem ficar bloqueada por indisponibilidade do provedor de e-mail.
  Não há fila na V1 — envio direto com registro do resultado no log (abaixo).

### 8.2 MongoDB — log de notificações (Task 5.4)

- Armazena o histórico de e-mails/eventos enviados (convites, confirmações).
- **Não é fonte de verdade** de dados de negócio (PRD §10): falha de escrita no Mongo
  não pode quebrar o fluxo principal.
- Ainda não provisionado: o `docker-compose.yml` atual só sobe o PostgreSQL, e não há
  driver do Mongo nas dependências — consistente com o status "Fase 5 pendente".

### 8.3 WebSocket (RF18 — Task 5.1)

- `@fastify/websocket`, no mesmo processo do servidor HTTP.
- Conexões agrupadas em canais por `businessId` (clientes da client view se conectam
  ao canal do slug que estão visualizando).
- Evento único da V1: "availability reservada" — emitido após o commit do Booking,
  com o id do slot, para a client view remover o horário sem refresh.
- Motivo do escopo por business: evita vazar entre tenants a informação de agenda e
  reduz fan-out (PRD §7 define explicitamente "canal por businessId").
- Trade-off aceito: hub em memória num único processo — sem Redis pub/sub, pois a V1
  tem uma única instância (ver §9 e §10).

### 8.4 Upload de avatar (RF19 — Task 5.3)

- `@fastify/multipart` para receber o arquivo.
- O PRD não define o destino do arquivo (disco local, S3, etc.) — em aberto, junto
  com o conflito de schema da §5 (não há campo para referenciar o avatar).

---

## 9. Infraestrutura e Deploy

### Ambiente de desenvolvimento (estado atual)

- **PostgreSQL 16 (alpine)** via `docker-compose.yml`, com volume persistente e
  healthcheck (`pg_isready`). Credenciais via `.env` (`DATABASE_URL`).
- **Aplicação fora do Docker**: `npm run dev` (tsx watch), porta 3333.
- Migrações com `prisma migrate dev`; inspeção com `prisma studio`.
- Build de produção: `tsc` → `dist/`, executado com `node dist/server.js`.

### Deploy (V1)

O PRD não define ambiente de produção — o escopo declarado é local/estudo
("Docker utilizado para rodar o PostgreSQL **localmente**", §10). O desenho de deploy
implícito nas decisões existentes é:

- **Instância única** do processo Node (obrigatório enquanto o hub WebSocket for
  em memória — escalar horizontalmente quebraria o RF18 sem um pub/sub externo).
- PostgreSQL e (na Fase 5) MongoDB como serviços de infraestrutura separados.
- Configuração 100% via variáveis de ambiente (`dotenv` já em uso), o que mantém o
  processo portável para qualquer plataforma de deploy futura.

### Observabilidade

O PRD não define requisitos de observabilidade. O que existe e o que está previsto:

- **Logs**: logger do Fastify (Pino), usado hoje apenas no error handler
  (`request.log.error`) para erros não tratados (500). O logger não está habilitado
  na criação da instância (`fastify()` sem `{ logger: true }`), portanto não há log
  de requests em runtime atualmente.
- **Trilha de notificações**: o log de e-mails/eventos no MongoDB (§8.2) funciona como
  auditoria das integrações de e-mail.
- **Healthcheck**: apenas do container Postgres; a rota `GET /` do servidor serve como
  verificação informal de vida da API.
- Métricas, tracing e alerta estão fora do escopo da V1 (não constam de PRD nem TASKS).

### Testes (Task 5.5)

`node:test` (script `npm test` já configurado), cobrindo as regras críticas exigidas
pelo PRD §14: dupla reserva (RF15), isolamento por `businessId` e availability
duplicada (RF12).

---

## 10. Riscos e Trade-offs

| # | Risco / Trade-off | Análise |
| --- | --- | --- |
| 1 | **Isolamento de tenant só em código** | Um filtro `businessId` esquecido num repository vaza dados entre tenants. Mitigação prevista: checagem dupla (middleware + service) e testes de autorização obrigatórios (Task 5.5). Alternativas (RLS, schema por tenant) estão fora do escopo do PRD. |
| 2 | **WebSocket em memória, instância única** | Simples e suficiente para a V1, mas impede escala horizontal — segunda instância não receberia os broadcasts. Aceito conscientemente; um pub/sub externo seria mudança fora do escopo. |
| 3 | **E-mail síncrono, sem fila** | Provedor lento degrada a latência das rotas que disparam e-mail. Aceito na V1 desde que o envio fique fora da transação e não bloqueie a resposta principal. |
| 4 | **⚠️ Conflito: convites impossíveis no schema atual** | RF02/RF03 + Task 2.2 exigem usuário "sem senha, com token de convite"; o schema exige `password` e não tem token. Bloqueia a Fase 2/3.1 até decisão de modelagem (ver §5). |
| 5 | **⚠️ Conflito: avatar sem campo no banco** | RF19 não tem onde persistir a referência do arquivo. Bloqueia a Task 5.3 até decisão de modelagem e de storage. |
| 6 | **⚠️ Conflito: PRD desatualizado vs. schema** | `price Float` (PRD) vs. `Decimal(10,2)` (implementado); `updatedAt` só na implementação. O banco migrado é o estado real; o PRD precisa de atualização para não induzir erro. |
| 7 | **`businessId` derivado por join em Availability/Booking** | Cada checagem de tenant e cada broadcast WS custa um join extra. Aceitável no volume da V1; desnormalizar seria alteração de modelo fora do escopo. |
| 8 | **Slots fixos (string `startTime`/`endTime`, 1 slot = 1 booking)** | Sem validação de tipo/timezone no banco para horários; serviços de duração diferente do slot não são representáveis. Limitação assumida no PRD §5. |
| 9 | **MongoDB adiciona operação para valor pequeno** | Um segundo banco só para log de notificações é custo operacional; justificado apenas pelo objetivo de aprendizado (PRD §15). Falhas no Mongo não podem afetar o fluxo principal. |
| 10 | **Logger desabilitado** | Sem `{ logger: true }`, o `request.log.error` do error handler é o único log e não há visibilidade de requests. Baixo risco em dev; relevante ao chegar em produção. |
