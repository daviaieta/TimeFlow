# Fluxo público de agendamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliente final marca horário sem login: página pública por slug com wizard serviço → profissional → horário → dados, reserva à prova de corrida.

**Architecture:** Três rotas públicas novas (sem `authenticate`) seguindo o padrão route → controller → service → repository, com a lógica de decisão em `publicBookingRules.ts` (funções puras testadas). A reserva usa claim atômico (`updateMany` condicional em transação) com o `@unique` de `Booking.availabilityId` como backstop. No web, uma rota dinâmica `[slug]` renderiza um wizard client-side de 4 passos; helpers puros em `web/lib/publicBooking.ts`.

**Tech Stack:** Fastify 5, Prisma 6, PostgreSQL, Next.js App Router, React, Tailwind, shadcn/ui, `node --test`.

## Global Constraints

- Todo schema de rota usa `additionalProperties: false` (convenção do projeto).
- Testes do servidor: `npm test` em `server/` (glob `src/**/*.test.ts` expande um nível — testes ficam em `src/<pasta>/*.test.ts`).
- Testes do web: `npm test` em `web/` (`node --test lib/*.test.ts`, Node 25 com type stripping nativo — imports de teste levam extensão `.ts` explícita; **não adicionar tsx ao web**).
- Mensagens de erro do servidor em inglês; textos de UI em português.
- Antes de escrever código Next novo, seguir `web/AGENTS.md`: ler o guia relevante em `web/node_modules/next/dist/docs/` (rotas dinâmicas / `useParams`).
- Reuso obrigatório: `formatBusinessName`/`businessInitials` (`web/lib/businessName.ts`), `formatMinutes`/`localDayKey` (`web/lib/schedule.ts`), `errorHandler` já mapeia P2002 → 409.
- TDD: teste primeiro, ver falhar, implementar, ver passar, commitar.

---

### Task 1: Regras puras do fluxo público (servidor)

**Files:**
- Create: `server/src/services/publicBookingRules.ts`
- Test: `server/src/services/publicBookingRules.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `isSlotUpcoming(slot: { date: Date; startTime: string }, now: Date): boolean`
  - `toPublicBusinessDto(business: { name; slug }, services: CatalogService[]): PublicBusinessDto`
  - `toPublicSlotDto(slot: { id; date: Date; startTime; endTime }): PublicSlotDto`
  - `buildBookingSummary(args): BookingSummary`
  - tipos `CatalogService`, `PublicBusinessDto`, `PublicSlotDto`, `BookingSummary`

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/src/services/publicBookingRules.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBookingSummary,
  isSlotUpcoming,
  toPublicBusinessDto,
  toPublicSlotDto,
} from "./publicBookingRules";

// now fixo: 2026-07-24 14:30 local
const now = new Date(2026, 6, 24, 14, 30);

test("slot de dia futuro está disponível", () => {
  assert.equal(
    isSlotUpcoming({ date: new Date("2026-07-25T00:00:00.000Z"), startTime: "09:00" }, now),
    true,
  );
});

test("slot de dia passado não está disponível", () => {
  assert.equal(
    isSlotUpcoming({ date: new Date("2026-07-23T00:00:00.000Z"), startTime: "09:00" }, now),
    false,
  );
});

test("slot de hoje só vale se a hora ainda não passou", () => {
  const today = new Date("2026-07-24T00:00:00.000Z");
  assert.equal(isSlotUpcoming({ date: today, startTime: "14:00" }, now), false);
  assert.equal(isSlotUpcoming({ date: today, startTime: "14:30" }, now), false);
  assert.equal(isSlotUpcoming({ date: today, startTime: "15:00" }, now), true);
});

test("catálogo público omite serviço sem profissional", () => {
  const dto = toPublicBusinessDto({ name: "old-brothers", slug: "old-brothers" }, [
    {
      id: 1,
      name: "Corte",
      duration: 30,
      price: "50",
      employees: [{ id: 13, name: "Derek" }],
    },
    { id: 2, name: "Fantasma", duration: 20, price: "10", employees: [] },
  ]);

  assert.equal(dto.business.name, "old-brothers");
  assert.deepEqual(
    dto.services.map((s) => s.id),
    [1],
  );
  assert.equal(dto.services[0].price, "50");
  assert.deepEqual(dto.services[0].employees, [{ id: 13, name: "Derek" }]);
});

test("slot público serializa a data como ISO", () => {
  const dto = toPublicSlotDto({
    id: 7,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
  });

  assert.deepEqual(dto, {
    id: 7,
    date: "2026-07-25T00:00:00.000Z",
    startTime: "09:00",
    endTime: "10:00",
  });
});

test("resumo da reserva junta negócio, serviço, profissional e slot", () => {
  const summary = buildBookingSummary({
    businessName: "old-brothers",
    service: { name: "Corte", duration: 30, price: "50" },
    employeeName: "Derek",
    slot: { date: new Date("2026-07-25T00:00:00.000Z"), startTime: "09:00", endTime: "10:00" },
    clientName: "Marcos",
  });

  assert.deepEqual(summary, {
    business: "old-brothers",
    service: "Corte",
    duration: 30,
    price: "50",
    employee: "Derek",
    date: "2026-07-25T00:00:00.000Z",
    startTime: "09:00",
    endTime: "10:00",
    clientName: "Marcos",
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module './publicBookingRules'`.

- [ ] **Step 3: Implementar**

Criar `server/src/services/publicBookingRules.ts`:

```ts
// price chega como Prisma Decimal em produção e como string nos testes —
// ambos respondem a toString().
interface PriceLike {
  toString(): string;
}

export interface CatalogService {
  id: number;
  name: string;
  duration: number;
  price: PriceLike;
  employees: { id: number; name: string }[];
}

export interface PublicBusinessDto {
  business: { name: string; slug: string };
  services: {
    id: number;
    name: string;
    duration: number;
    price: string;
    employees: { id: number; name: string }[];
  }[];
}

export interface PublicSlotDto {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
}

export interface BookingSummary {
  business: string;
  service: string;
  duration: number;
  price: string;
  employee: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// A data do slot é meia-noite UTC; "hoje" vem do relógio local do servidor.
// Produto opera num único fuso — aceito no spec.
export function isSlotUpcoming(
  slot: { date: Date; startTime: string },
  now: Date,
): boolean {
  const slotDay = slot.date.toISOString().slice(0, 10);
  const today = localDayKey(now);

  if (slotDay > today) return true;
  if (slotDay < today) return false;

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return slot.startTime > `${hours}:${minutes}`;
}

// Serviço sem profissional vinculado sai do catálogo: o cliente não pode
// escolher um caminho sem horário possível.
export function toPublicBusinessDto(
  business: { name: string; slug: string },
  services: CatalogService[],
): PublicBusinessDto {
  return {
    business: { name: business.name, slug: business.slug },
    services: services
      .filter((service) => service.employees.length > 0)
      .map((service) => ({
        id: service.id,
        name: service.name,
        duration: service.duration,
        price: service.price.toString(),
        employees: service.employees,
      })),
  };
}

export function toPublicSlotDto(slot: {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
}): PublicSlotDto {
  return {
    id: slot.id,
    date: slot.date.toISOString(),
    startTime: slot.startTime,
    endTime: slot.endTime,
  };
}

export function buildBookingSummary(args: {
  businessName: string;
  service: { name: string; duration: number; price: PriceLike };
  employeeName: string;
  slot: { date: Date; startTime: string; endTime: string };
  clientName: string;
}): BookingSummary {
  return {
    business: args.businessName,
    service: args.service.name,
    duration: args.service.duration,
    price: args.service.price.toString(),
    employee: args.employeeName,
    date: args.slot.date.toISOString(),
    startTime: args.slot.startTime,
    endTime: args.slot.endTime,
    clientName: args.clientName,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && npm test`
Expected: PASS — 6 testes novos verdes (22 no total).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/publicBookingRules.ts server/src/services/publicBookingRules.test.ts
git commit -m "feat(server): add pure rules for the public booking flow"
```

---

### Task 2: API pública — repositórios, service, controller e rotas

**Files:**
- Create: `server/src/repositories/bookingRepository.ts`
- Create: `server/src/services/publicBookingService.ts`
- Create: `server/src/controllers/publicController.ts`
- Create: `server/src/routes/publicRoutes.ts`
- Modify: `server/src/repositories/businessRepository.ts` (novo método)
- Modify: `server/src/repositories/availabilityRepository.ts` (dois métodos)
- Modify: `server/src/repositories/employeeRepository.ts` (um método)
- Modify: `server/src/server.ts` (registrar rotas)

**Interfaces:**
- Consumes: `isSlotUpcoming`, `toPublicBusinessDto`, `toPublicSlotDto`, `buildBookingSummary` (Task 1); `normalizeClientName` de `availabilityRules`; `NotFoundError`/`ConflictError` de `lib/errors`
- Produces (para o web, Task 4):
  - `GET /public/businesses/:slug` → `PublicBusinessDto`
  - `GET /public/businesses/:slug/employees/:employeeId/slots` → `{ slots: PublicSlotDto[] }`
  - `POST /public/businesses/:slug/bookings` → 201 `{ booking: BookingSummary }`

- [ ] **Step 1: Métodos novos nos repositórios existentes**

Em `server/src/repositories/businessRepository.ts`, adicionar ao objeto:

```ts
  // Catálogo público: serviços com os profissionais que os oferecem.
  // password not-null = convite aceito; pendente não tem agenda.
  findBySlugWithCatalog(slug: string) {
    return prisma.business.findUnique({
      where: { slug },
      include: {
        services: {
          orderBy: { name: "asc" },
          include: {
            employees: {
              where: { employee: { password: { not: null } } },
              include: { employee: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
  },
```

Em `server/src/repositories/availabilityRepository.ts`, adicionar:

```ts
  findManyFreeByEmployee(employeeId: number) {
    return prisma.availability.findMany({
      where: { employeeId, isBooked: false },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
  },

  findByIdForBooking(id: number) {
    return prisma.availability.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, name: true, businessId: true } },
      },
    });
  },
```

Em `server/src/repositories/employeeRepository.ts`, adicionar:

```ts
  hasServiceLink(employeeId: number, serviceId: number) {
    return prisma.employeeService.findUnique({
      where: { employeeId_serviceId: { employeeId, serviceId } },
    });
  },
```

- [ ] **Step 2: Repositório de booking com claim atômico**

Criar `server/src/repositories/bookingRepository.ts`:

```ts
import { prisma } from "../lib/prisma";

interface BookingData {
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
}

export const bookingRepository = {
  // Claim atômico: só cria o Booking se ESTA transação virou o isBooked.
  // null = outro cliente levou o horário. O @unique de availabilityId é o
  // backstop no banco (P2002 → 409 no errorHandler).
  createWithClaim(availabilityId: number, data: BookingData) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.availability.updateMany({
        where: { id: availabilityId, isBooked: false },
        data: { isBooked: true },
      });

      if (claimed.count === 0) {
        return null;
      }

      return tx.booking.create({ data: { ...data, availabilityId } });
    });
  },
};
```

- [ ] **Step 3: Service com a validação em cadeia**

Criar `server/src/services/publicBookingService.ts`:

```ts
import { Role } from "@prisma/client";
import { ConflictError, NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";
import { bookingRepository } from "../repositories/bookingRepository";
import { businessRepository } from "../repositories/businessRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import { normalizeClientName } from "./availabilityRules";
import {
  buildBookingSummary,
  isSlotUpcoming,
  toPublicBusinessDto,
  toPublicSlotDto,
} from "./publicBookingRules";

interface PublicBookingInput {
  availabilityId: number;
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
}

export const publicBookingService = {
  async getBusinessPage(slug: string) {
    const business = await businessRepository.findBySlugWithCatalog(slug);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    return toPublicBusinessDto(
      business,
      business.services.map((service) => ({
        id: service.id,
        name: service.name,
        duration: service.duration,
        price: service.price,
        employees: service.employees.map((link) => link.employee),
      })),
    );
  },

  async listEmployeeSlots(slug: string, employeeId: number, now: Date) {
    const business = await businessRepository.findBySlug(slug);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const employee = await employeeRepository.findById(employeeId);
    if (
      !employee ||
      employee.businessId !== business.id ||
      employee.role !== Role.EMPLOYEE
    ) {
      throw new NotFoundError("Employee not found");
    }

    const free = await availabilityRepository.findManyFreeByEmployee(employeeId);
    return free.filter((slot) => isSlotUpcoming(slot, now)).map(toPublicSlotDto);
  },

  async createBooking(slug: string, input: PublicBookingInput, now: Date) {
    const business = await businessRepository.findBySlug(slug);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const service = await serviceRepository.findById(input.serviceId);
    if (!service || service.businessId !== business.id) {
      throw new NotFoundError("Service not found");
    }

    const slot = await availabilityRepository.findByIdForBooking(input.availabilityId);
    if (!slot || slot.employee.businessId !== business.id) {
      throw new NotFoundError("Time slot not found");
    }

    const offers = await employeeRepository.hasServiceLink(
      slot.employee.id,
      service.id,
    );
    if (!offers) {
      throw new ConflictError("This professional does not offer this service");
    }

    if (!isSlotUpcoming(slot, now)) {
      throw new ConflictError("This time slot is no longer available");
    }

    const clientName = normalizeClientName(input.clientName);
    if (!clientName) {
      throw new ConflictError("Client name is required");
    }

    const booking = await bookingRepository.createWithClaim(slot.id, {
      serviceId: service.id,
      clientName,
      clientPhone: input.clientPhone.trim(),
      clientEmail: input.clientEmail?.trim() || null,
    });
    if (!booking) {
      throw new ConflictError("This time slot has just been booked");
    }

    return buildBookingSummary({
      businessName: business.name,
      service,
      employeeName: slot.employee.name,
      slot,
      clientName,
    });
  },
};
```

- [ ] **Step 4: Controller e rotas públicas**

Criar `server/src/controllers/publicController.ts`:

```ts
import { FastifyReply, FastifyRequest } from "fastify";
import { publicBookingService } from "../services/publicBookingService";

export interface PublicBusinessParams {
  slug: string;
}

export interface PublicSlotsParams {
  slug: string;
  employeeId: number;
}

export interface PublicBookingBody {
  availabilityId: number;
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
}

export async function getPublicBusiness(
  request: FastifyRequest<{ Params: PublicBusinessParams }>,
  reply: FastifyReply,
): Promise<void> {
  const page = await publicBookingService.getBusinessPage(request.params.slug);
  reply.send(page);
}

export async function listPublicSlots(
  request: FastifyRequest<{ Params: PublicSlotsParams }>,
  reply: FastifyReply,
): Promise<void> {
  const slots = await publicBookingService.listEmployeeSlots(
    request.params.slug,
    request.params.employeeId,
    new Date(),
  );
  reply.send({ slots });
}

export async function createPublicBooking(
  request: FastifyRequest<{ Params: PublicBusinessParams; Body: PublicBookingBody }>,
  reply: FastifyReply,
): Promise<void> {
  const booking = await publicBookingService.createBooking(
    request.params.slug,
    request.body,
    new Date(),
  );
  reply.status(201).send({ booking });
}
```

Criar `server/src/routes/publicRoutes.ts`:

```ts
import { FastifyInstance } from "fastify";
import {
  createPublicBooking,
  getPublicBusiness,
  listPublicSlots,
  PublicBookingBody,
  PublicBusinessParams,
  PublicSlotsParams,
} from "../controllers/publicController";

// Rotas SEM authenticate — superfície pública do produto. Arquivo separado
// de propósito, para o limite público ficar visível.

const slugParamsSchema = {
  params: {
    type: "object",
    required: ["slug"],
    additionalProperties: false,
    properties: {
      slug: { type: "string", minLength: 1 },
    },
  },
};

const slotsParamsSchema = {
  params: {
    type: "object",
    required: ["slug", "employeeId"],
    additionalProperties: false,
    properties: {
      slug: { type: "string", minLength: 1 },
      employeeId: { type: "integer" },
    },
  },
};

const bookingSchema = {
  ...slugParamsSchema,
  body: {
    type: "object",
    required: ["availabilityId", "serviceId", "clientName", "clientPhone"],
    additionalProperties: false,
    properties: {
      availabilityId: { type: "integer" },
      serviceId: { type: "integer" },
      clientName: { type: "string", minLength: 1, maxLength: 80 },
      clientPhone: { type: "string", minLength: 8, maxLength: 20 },
      clientEmail: { type: "string", format: "email", maxLength: 120 },
    },
  },
};

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: PublicBusinessParams }>(
    "/public/businesses/:slug",
    { schema: slugParamsSchema },
    getPublicBusiness,
  );

  app.get<{ Params: PublicSlotsParams }>(
    "/public/businesses/:slug/employees/:employeeId/slots",
    { schema: slotsParamsSchema },
    listPublicSlots,
  );

  app.post<{ Params: PublicBusinessParams; Body: PublicBookingBody }>(
    "/public/businesses/:slug/bookings",
    { schema: bookingSchema },
    createPublicBooking,
  );
}
```

Em `server/src/server.ts`, adicionar o import e o registro junto aos demais:

```ts
import { publicRoutes } from "./routes/publicRoutes";
// ...
app.register(publicRoutes);
```

- [ ] **Step 5: Testes e typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: 22 testes verdes, `tsc --noEmit` sem saída.

- [ ] **Step 6: Verificação end-to-end por curl**

Com o servidor rodando (`npm run dev` já ativo via tsx watch):

```bash
# 1) catálogo público — sem token
curl -s http://localhost:3333/public/businesses/old-brothers-barbershop
# Expected: business + services, cada um com employees; serviço sem vínculo ausente

# 2) slug inexistente
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/public/businesses/nao-existe
# Expected: 404

# 3) slots do Derek (id 13) — só livres e futuros
curl -s http://localhost:3333/public/businesses/old-brothers-barbershop/employees/13/slots
# Expected: lista sem slots passados, sem slots isBooked

# 4) reserva válida (usar um availabilityId livre do passo 3)
curl -s -w "\n%{http_code}\n" -X POST \
  http://localhost:3333/public/businesses/old-brothers-barbershop/bookings \
  -H "Content-Type: application/json" \
  -d '{"availabilityId":<ID>,"serviceId":<SVC>,"clientName":"Cliente Curl","clientPhone":"11999990000"}'
# Expected: 201 com o resumo completo

# 5) mesmo slot de novo
# Expected: 409 "This time slot has just been booked"

# 6) profissional que não oferece o serviço → 409; slot de outro negócio → 404
```

- [ ] **Step 7: Verificação de concorrência (dois clientes, um slot)**

Criar um slot livre novo e disparar dois POSTs em paralelo no mesmo `availabilityId`:

```bash
for i in 1 2; do
  curl -s -o /tmp/conc_$i.json -w "%{http_code}\n" -X POST \
    http://localhost:3333/public/businesses/old-brothers-barbershop/bookings \
    -H "Content-Type: application/json" \
    -d '{"availabilityId":<ID>,"serviceId":<SVC>,"clientName":"Corrida '$i'","clientPhone":"11988880000"}' &
done; wait
```

Expected: um `201` e um `409`. Confirmar no banco que existe exatamente **1** Booking para o slot:

```bash
cd server && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.booking.count({ where: { availabilityId: <ID> } })
  .then(n => console.log('bookings no slot:', n)).finally(() => p.\$disconnect());
"
```

- [ ] **Step 8: Commit**

```bash
git add server/src
git commit -m "feat(server): add public booking API with atomic slot claim"
```

---

### Task 3: Helpers puros do wizard (web)

**Files:**
- Create: `web/lib/publicBooking.ts`
- Test: `web/lib/publicBooking.test.ts`

**Interfaces:**
- Consumes: nada (tipos próprios espelhando a API da Task 2)
- Produces:
  - tipos `PublicService`, `PublicEmployee`, `PublicBusiness`, `PublicSlot`, `BookingSummary`
  - `groupSlotsByDay(slots: PublicSlot[]): [string, PublicSlot[]][]`
  - `dayChipLabel(dayKey: string, todayKey: string): string`
  - `isValidPhone(value: string): boolean`
  - `formatPrice(price: string): string`

- [ ] **Step 1: Escrever o teste que falha**

Criar `web/lib/publicBooking.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayChipLabel,
  formatPrice,
  groupSlotsByDay,
  isValidPhone,
  type PublicSlot,
} from "./publicBooking.ts";

function slot(id: number, date: string, startTime = "09:00"): PublicSlot {
  return { id, date, startTime, endTime: "10:00" };
}

test("agrupa slots por dia preservando a ordem", () => {
  const groups = groupSlotsByDay([
    slot(1, "2026-07-25T00:00:00.000Z"),
    slot(2, "2026-07-25T00:00:00.000Z", "14:00"),
    slot(3, "2026-07-26T00:00:00.000Z"),
  ]);

  assert.deepEqual(
    groups.map(([day, slots]) => [day, slots.length]),
    [
      ["2026-07-25", 2],
      ["2026-07-26", 1],
    ],
  );
});

test("chip do dia de hoje vira 'Hoje'", () => {
  assert.equal(dayChipLabel("2026-07-24", "2026-07-24"), "Hoje");
});

test("chip de outro dia mostra semana e data", () => {
  // 2026-07-25 é sábado
  assert.equal(dayChipLabel("2026-07-25", "2026-07-24"), "sáb, 25 jul");
  // 2026-08-03 é segunda
  assert.equal(dayChipLabel("2026-08-03", "2026-07-24"), "seg, 03 ago");
});

test("telefone válido tem pelo menos 8 dígitos", () => {
  assert.equal(isValidPhone("(11) 99999-0000"), true);
  assert.equal(isValidPhone("11999990000"), true);
  assert.equal(isValidPhone("123"), false);
  assert.equal(isValidPhone("abc-def"), false);
});

test("preço decimal vira moeda brasileira", () => {
  assert.equal(formatPrice("50"), "R$ 50,00");
  assert.equal(formatPrice("50.5"), "R$ 50,50");
  assert.equal(formatPrice("1250.75"), "R$ 1250,75");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npm test`
Expected: FAIL — `Cannot find module './publicBooking.ts'`.

- [ ] **Step 3: Implementar**

Criar `web/lib/publicBooking.ts`:

```ts
// Tipos espelhando a API pública (/public/businesses/:slug).
export interface PublicEmployee {
  id: number;
  name: string;
}

export interface PublicService {
  id: number;
  name: string;
  duration: number;
  price: string;
  employees: PublicEmployee[];
}

export interface PublicBusiness {
  business: { name: string; slug: string };
  services: PublicService[];
}

export interface PublicSlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
}

export interface BookingSummary {
  business: string;
  service: string;
  duration: number;
  price: string;
  employee: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function groupSlotsByDay(slots: PublicSlot[]): [string, PublicSlot[]][] {
  const groups = new Map<string, PublicSlot[]>();

  for (const slot of slots) {
    const key = slot.date.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(slot);
    groups.set(key, list);
  }

  return [...groups.entries()];
}

// Manual em vez de toLocaleDateString para o resultado ser determinístico
// nos testes, independente do ICU do ambiente.
export function dayChipLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return "Hoje";

  const date = new Date(`${dayKey}T00:00:00`);
  const weekday = WEEKDAYS[date.getDay()];
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS[date.getMonth()];
  return `${weekday}, ${day} ${month}`;
}

export function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, "").length >= 8;
}

export function formatPrice(price: string): string {
  const value = Number(price);
  const cents = Math.round(value * 100);
  const reais = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `R$ ${reais},${rest}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npm test && npm run typecheck`
Expected: 5 testes novos verdes (19 no total no web), `tsc --noEmit` sem saída.

- [ ] **Step 5: Commit**

```bash
git add web/lib/publicBooking.ts web/lib/publicBooking.test.ts
git commit -m "feat(web): add pure helpers for the public booking wizard"
```

---

### Task 4: Página pública com o wizard

**Files:**
- Create: `web/app/[slug]/page.tsx`
- Create: `web/app/[slug]/booking-wizard.tsx`

**Interfaces:**
- Consumes: API pública (Task 2); tipos e helpers de `@/lib/publicBooking` (Task 3); `formatBusinessName`/`businessInitials` de `@/lib/businessName`; `formatMinutes`/`localDayKey` de `@/lib/schedule`; `ApiError`/`fetchAdapter` de `@/adapters/fetchAdapter`
- Produces: nada (folha da feature)

- [ ] **Step 1: Ler a documentação do Next para rota dinâmica client-side**

Conforme `web/AGENTS.md`, antes de escrever:

```bash
ls web/node_modules/next/dist/docs/ | grep -i -E "routing|dynamic|params" 
```

Ler o guia de rotas dinâmicas e confirmar o uso de `useParams()` em client components nesta versão.

- [ ] **Step 2: Criar a página fina**

Criar `web/app/[slug]/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import { BookingWizard } from "./booking-wizard";

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();

  return <BookingWizard slug={params.slug} />;
}
```

- [ ] **Step 3: Criar o wizard**

Criar `web/app/[slug]/booking-wizard.tsx` com esta estrutura (o implementador tem liberdade nos detalhes de classe Tailwind, mantendo o comportamento):

```tsx
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { businessInitials, formatBusinessName } from "@/lib/businessName";
import { formatMinutes, localDayKey } from "@/lib/schedule";
import {
  BookingSummary,
  PublicBusiness,
  PublicEmployee,
  PublicService,
  PublicSlot,
  dayChipLabel,
  formatPrice,
  groupSlotsByDay,
  isValidPhone,
} from "@/lib/publicBooking";

type Step = "service" | "employee" | "slot" | "details" | "success";

const STEP_ORDER: Step[] = ["service", "employee", "slot", "details"];

export function BookingWizard({ slug }: { slug: string }) {
  // catálogo
  const [catalog, setCatalog] = useState<PublicBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  // wizard
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<PublicService | null>(null);
  const [employee, setEmployee] = useState<PublicEmployee | null>(null);
  const [employeeSkipped, setEmployeeSkipped] = useState(false);

  // slots
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<PublicSlot | null>(null);

  // dados + confirmação
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingSummary | null>(null);

  useEffect(() => {
    fetchAdapter<PublicBusiness>({ method: "GET", path: `/public/businesses/${slug}` })
      .then(({ data }) => setCatalog(data))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setMissing(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const loadSlots = useCallback(
    (employeeId: number) => {
      setSlotsLoading(true);
      setSlotsError(null);
      setSlot(null);
      return fetchAdapter<{ slots: PublicSlot[] }>({
        method: "GET",
        path: `/public/businesses/${slug}/employees/${employeeId}/slots`,
      })
        .then(({ data }) => {
          setSlots(data.slots);
          setDay(data.slots[0]?.date.slice(0, 10) ?? null);
        })
        .catch(() => setSlotsError("Não foi possível carregar os horários."))
        .finally(() => setSlotsLoading(false));
    },
    [slug],
  );

  if (missing) notFound();
  if (loading) { /* tela cheia com <Spinner /> centrado */ }
  if (!catalog) { /* mensagem de erro genérica com botão tentar de novo */ }

  // --- transições ---
  function chooseService(s: PublicService) {
    setService(s);
    if (s.employees.length === 1) {
      setEmployee(s.employees[0]);
      setEmployeeSkipped(true);
      setStep("slot");
      loadSlots(s.employees[0].id);
    } else {
      setEmployeeSkipped(false);
      setStep("employee");
    }
  }

  function chooseEmployee(e: PublicEmployee) {
    setEmployee(e);
    setStep("slot");
    loadSlots(e.id);
  }

  function goBack() {
    if (step === "employee") setStep("service");
    else if (step === "slot") setStep(employeeSkipped ? "service" : "employee");
    else if (step === "details") setStep("slot");
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service || !slot) return;
    if (!isValidPhone(clientPhone)) {
      setFormError("Informe um WhatsApp válido.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const { data } = await fetchAdapter<{ booking: BookingSummary }>({
        method: "POST",
        path: `/public/businesses/${slug}/bookings`,
        body: {
          availabilityId: slot.id,
          serviceId: service.id,
          clientName,
          clientPhone,
          clientEmail: clientEmail.trim() || undefined,
        },
      });
      setConfirmation(data.booking);
      setStep("success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && employee) {
        // corrida: alguém levou o horário — volta e recarrega
        setStep("slot");
        setSlotsError("Esse horário acabou de ser reservado. Escolha outro.");
        loadSlots(employee.id);
      } else {
        setFormError(err instanceof ApiError ? err.message : "Erro inesperado.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // --- render ---
  // Chrome comum a todos os passos (exceto success):
  //  - header: monograma businessInitials + formatBusinessName + "Passo X de 4"
  //  - barra de progresso: STEP_ORDER.indexOf(step), preenchida em indigo
  //  - botão Voltar (exceto no passo 1)
  //  - dock de resumo: chips com serviço · profissional · dia/horário já escolhidos
  //
  // Passo service: um card por catalog.services — nome, formatMinutes(duration),
  //   formatPrice(price); clique → chooseService.
  // Passo employee: um card por service.employees; clique → chooseEmployee.
  // Passo slot: chips de dia via groupSlotsByDay(slots) com dayChipLabel(day,
  //   localDayKey(new Date())); grade 3 colunas de startTime do dia ativo;
  //   selecionar → setSlot + botão Continuar → setStep("details").
  //   Vazio: "Sem horários disponíveis" (+ slotsError quando houver).
  // Passo details: form nome (required), WhatsApp (type tel, required),
  //   e-mail (type email, opcional); botão submit
  //   "Confirmar · {dayChipLabel} {slot.startTime}" com spinner quando submitting.
  // Success: círculo com CheckmarkCircle02Icon, "Agendado!", cartão com
  //   confirmation (serviço, profissional, dia por extenso, horário, preço,
  //   nome) e aviso para guardar os dados; sem navegação extra.
  //
  // Mobile-first: container max-w-md mx-auto, alvos de toque ≥44px,
  //   grades com gap pequeno; tema herda o dark/light do app.
}
```

O comentário de render acima é o contrato de comportamento; o corpo JSX completo fica a cargo do implementador seguindo os componentes shadcn já usados no dashboard (`Button`, `Field`, `Input`, `Spinner`).

- [ ] **Step 4: Typecheck, lint e testes**

Run: `cd web && npm run typecheck && npm test && npm run lint`
Expected: typecheck limpo; 19 testes verdes; lint sem erros **novos** (os 3 pré-existentes de `landing-header.tsx`/`accept-invite` permanecem).

- [ ] **Step 5: Verificação no ambiente real**

```bash
# página responde
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/old-brothers-barbershop
# Expected: 200

# slug falso renderiza o 404 do Next
curl -s http://localhost:3000/rota-inexistente-xyz | grep -c "404"
# Expected: >= 1
```

Garantir dados de demonstração (slots livres futuros para o Derek) e pedir ao usuário a conferência visual no celular/browser: fluxo completo até a tela de sucesso, caso de corrida (reservar o mesmo slot em duas abas) e o slot sumindo da agenda pública.

- [ ] **Step 6: Confirmar o efeito no dashboard do colaborador**

Após uma reserva pública, `GET /availabilities` do colaborador deve mostrar o slot com `clientName` do cliente, `isBooked: true` e `locked: true` (Badge "Reservado" na agenda interna, sem botões de editar/excluir).

```bash
TOKEN=<token EMPLOYEE>
curl -s http://localhost:3333/availabilities -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 7: Commit**

```bash
git add web/app/\[slug\]
git commit -m "feat(web): add public booking wizard at /[slug]"
```

---

## Self-Review

**Cobertura do spec:**

| Requisito | Task |
|---|---|
| GET catálogo agregado, serviço sem profissional omitido | 1 (`toPublicBusinessDto`), 2 |
| GET slots livres+futuros, escopado por slug | 1 (`isSlotUpcoming`), 2 |
| POST com validação em cadeia (404/409 por elo) | 2 (service) |
| Claim atômico + backstop unique | 2 (`createWithClaim`; P2002 já mapeado) |
| Wizard 4 passos, pulo do profissional único, Voltar correto | 4 (`chooseService`, `goBack`) |
| Chips de dia + grade de horário | 3 (`groupSlotsByDay`, `dayChipLabel`), 4 |
| 409 no confirmar → volta ao passo 3 e recarrega | 4 (`handleConfirm`) |
| Slug inexistente → `notFound()` | 4 |
| Nome/WhatsApp obrigatórios, e-mail opcional, validação de telefone | 2 (schema), 3 (`isValidPhone`), 4 |
| Tela de sucesso com resumo completo | 1 (`buildBookingSummary`), 4 |
| Identidade: monograma + nome formatado | 4 (reuso `businessName`) |
| Preço/duração formatados | 3 (`formatPrice`), reuso `formatMinutes` |
| Testes puros servidor e web + concorrência real | 1, 2 (Steps 6-7), 3 |
| Colaborador vê slot reservado como `locked` | 4 (Step 6) |

**Tipos consistentes entre tasks:** `PublicSlot`/`PublicBusiness`/`BookingSummary` do web (Task 3) espelham `PublicSlotDto`/`PublicBusinessDto`/`BookingSummary` do servidor (Task 1); `createWithClaim` retorna `Booking | null` e o service converte `null` em 409; `hasServiceLink`/`findByIdForBooking`/`findManyFreeByEmployee`/`findBySlugWithCatalog` usados na Task 2 Step 3 são exatamente os criados nos Steps 1-2.

**Limite conhecido (herdado do padrão do projeto):** repositórios sem teste automatizado — sem banco de teste isolado; a integração é coberta pelos Steps 6-7 da Task 2 (incluindo a corrida real de concorrência). Rate-limiting e slugs reservados são follow-ups do spec, fora deste plano.
