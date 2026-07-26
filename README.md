# Time Flow

SaaS multi-tenant de agendamentos para negócios de serviço — barbearias, salões,
consultórios. Cada negócio opera isolado dentro da mesma aplicação, com seus
próprios colaboradores, serviços e agenda, e ganha uma página pública de reserva
em `/{slug}` onde o cliente marca horário sem precisar de conta.

O projeto é também um estudo de arquitetura de back-end: multi-tenancy, RBAC,
prevenção de condição de corrida via banco e modelagem de relacionamentos N:N.

## Stack

**API** — Node.js, TypeScript, Fastify, Prisma, PostgreSQL, JWT, bcrypt,
Nodemailer. Validação de entrada por JSON Schema, testes com `node:test`.

**Web** — Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui.

## Arquitetura

A API segue camadas com dependência em uma direção só:

```
routes → controllers → services → repositories → Prisma → PostgreSQL
```

- **routes** — schema JSON de entrada e os middlewares de `authenticate` /
  `authorize` de cada rota.
- **controllers** — traduzem HTTP para chamadas de serviço. Não têm regra.
- **services** — a regra de negócio. As partes puras (cálculo de slots,
  encaixe de duração, KPIs) vivem em arquivos `*Rules.ts` separados dos que
  tocam o banco, e são o que os testes cobrem.
- **repositories** — o único lugar que fala Prisma.

O erro sobe como exceção tipada (`NotFoundError`, `ConflictError`, …) e vira
status HTTP no error handler central.

```
booking-saas/
├── server/          API Fastify
│   ├── prisma/      schema, migrations e seed
│   └── src/
│       ├── routes/ controllers/ services/ repositories/
│       ├── middlewares/   autenticação e autorização
│       └── lib/           erros, JWT de convite, hash, e-mail, tempo
└── web/             front-end Next.js
    ├── app/         rotas (landing, login, dashboard, /[slug] público)
    ├── components/  UI compartilhada
    └── lib/         helpers puros + seus testes
```

## Papéis

| Papel        | Pode fazer                                                       |
| ------------ | ---------------------------------------------------------------- |
| `SUPERADMIN` | Criar negócios e o Admin inicial de cada um                       |
| `ADMIN`      | Editar o próprio negócio, gerenciar serviços e colaboradores      |
| `EMPLOYEE`   | Gerenciar a própria agenda de disponibilidade                     |
| cliente      | Reservar pela página pública, sem conta                           |

Regra crítica: toda ação de `ADMIN` e `EMPLOYEE` é restrita ao `businessId` do
usuário logado. Ninguém lê nem escreve dados de outro negócio.

## Rodando localmente

Pré-requisitos: Node.js 20+, Docker e npm.

**1. Banco**

```bash
cd server
docker compose up -d
```

**2. API**

```bash
cd server
cp .env.example .env      # preencha JWT_SECRET
npm install
npm run db:migrate
npm run db:seed           # cria o SUPERADMIN inicial
npm run dev               # http://localhost:3333
```

**3. Web**

```bash
cd web
cp .env.example .env.local
npm install
npm run dev               # http://localhost:3000
```

O seed imprime no console o e-mail e a senha do superadmin. Os e-mails de
convite, sem SMTP configurado, caem numa conta de teste Ethereal e o link de
preview também sai no console — nada é entregue de verdade em dev.

## Scripts

| Comando             | O que faz                                    |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | sobe em modo watch (server e web)            |
| `npm test`          | roda os testes (server e web)                |
| `npm run typecheck` | `tsc --noEmit` (server e web)                |
| `npm run build`     | build de produção (server e web)             |
| `npm run db:migrate`| aplica as migrations                         |
| `npm run db:seed`   | popula o superadmin e um convite de teste     |
| `npm run db:studio` | abre o Prisma Studio                         |

## API

```
POST   /auth/login                       público
POST   /auth/accept-invite               público — define senha via token
GET    /auth/me                          autenticado

POST   /businesses                       SUPERADMIN

POST   /services                         ADMIN
GET    /services                         ADMIN, EMPLOYEE
PUT    /services/:id                     ADMIN
DELETE /services/:id                     ADMIN

POST   /employees                        ADMIN — dispara convite
GET    /employees                        ADMIN, EMPLOYEE
DELETE /employees/:id                    ADMIN
POST   /employees/:id/services           ADMIN — vincula a um serviço
DELETE /employees/:id/services/:serviceId ADMIN

GET    /availabilities                   EMPLOYEE — a própria agenda
POST   /availabilities                   EMPLOYEE
POST   /availabilities/generate          EMPLOYEE — geração em lote
PUT    /availabilities/:id               EMPLOYEE
DELETE /availabilities/:id               EMPLOYEE

GET    /dashboard/overview               ADMIN — KPIs, ocupação e ranking

GET    /public/businesses/:slug          público — catálogo do negócio
GET    /public/businesses/:slug/employees/:employeeId/slots?serviceId=
                                         público — horários em que o serviço cabe
POST   /public/businesses/:slug/bookings público — cria a reserva
```

## Decisões de modelagem

**Uma reserva ocupa N slots consecutivos.** A grade de disponibilidade tem
passo fixo, mas um serviço de uma hora precisa de dois slots de 30 minutos.
Por isso a chave estrangeira vive em `Availability.bookingId`, não o contrário:
uma `Booking` tem muitas `Availability`.

**Reservar é um claim atômico do bloco inteiro.** Dentro de uma transação, um
`updateMany` vira `isBooked` de `false` para `true` em todos os slots do bloco
de uma vez; se a contagem não bate, alguém levou algum horário no meio do
caminho e a reserva inteira cai. Meia reserva deixaria o serviço sem tempo para
terminar. Dois clientes disputando o mesmo horário resultam em exatamente uma
reserva.

**O cliente final não é uma tabela.** Nome, telefone e e-mail ficam no próprio
`Booking`. Sem conta de cliente, não há histórico consolidado para sustentar —
a tabela viria antes da necessidade.

**Convite no lugar de cadastro.** Admins e colaboradores nascem sem senha, com
um token de convite expirável; a senha é definida em `/accept-invite`. Ninguém
cria a própria conta.

## Estado atual

Funcionando: autenticação com convite, CRUD de serviços, gestão de equipe e
vínculos com serviços, agenda de disponibilidade com geração em lote, página
pública de reserva com seleção de serviço, profissional e horário, e dashboard
do dono com KPIs, ocupação e mapa de calor.

A caminho do MVP: painel de SUPERADMIN e configurações do negócio, reservas
registradas manualmente pelo balcão, e-mails reais de convite e confirmação,
responsividade completa no celular e testes de concorrência e isolamento entre
negócios.
