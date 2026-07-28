# Reservas Internas (Fase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let ADMIN/EMPLOYEE create a real reservation on behalf of a walk-in client, from inside the existing schedule screen, and retire the manual `clientName`-on-`Availability` workaround it replaces.

**Architecture:** Extract the slot-matching rules and the booking-creation core that `publicBookingService` already has into shared modules (`bookingRules.ts`, `bookingService.ts`), then build a thin `internalBookingService` + `POST /bookings` route on top of that shared core. Separately, add a `Booking.source` column (`ONLINE` / `INTERNAL`) to replace the "has a Booking = online" proxy the dashboard KPI currently relies on, since that proxy stops being true once manual encaixe is gone. On the frontend, the existing `/dashboard/schedule` page gains an employee picker (so ADMIN — who has no agenda of its own — and EMPLOYEE can view a colleague's calendar) and a **Reservar** dialog on free slots.

**Tech Stack:** Fastify + Prisma (Postgres) on the server, Next.js on the web app, `node:test`/`node:assert` for unit tests (pure-function style — this codebase does not test services/routes against a DB, only extracted `*Rules.ts` modules).

## Global Constraints

- All new/changed JSON Schemas keep `additionalProperties: false` (per project convention — see repo memory on hardening).
- No comments explaining WHAT code does — only WHY, matching the existing style in this codebase (see the profusion of "why" comments in `publicBookingRules.ts`, `availabilityRules.ts`, etc.). Copy that tone in new code.
- Server tests run via `node --import tsx --test <path>`; web tests run via `node --test <path>` (see each package's `test` script). Only pure-logic modules (`*Rules.ts`, `lib/*.ts`) get automated tests in this codebase — do not invent DB-hitting service/route tests, that's not this project's convention.
- Every task must leave `npm run typecheck` green in the package(s) it touches before moving to the next task.

---

### Task 1: Remove the manual encaixe workaround, add `Booking.source`

This is one atomic change: dropping `Availability.clientName` breaks every place that reads it (availability rules/service, dashboard repository/rules), and the dashboard's "online vs manual" KPI split — which today keys off "has a `Booking` row or not" — has no meaning left once manual encaixe is gone. Both must land together with a real `Booking.source` column, or the app doesn't compile / the KPI silently goes to zero.

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create migration via `npx prisma migrate dev --name booking_source_and_drop_manual_encaixe` (run from `server/`)
- Modify: `server/src/services/availabilityRules.ts`
- Modify: `server/src/services/availabilityRules.test.ts`
- Modify: `server/src/services/availabilityService.ts`
- Modify: `server/src/controllers/availabilityController.ts`
- Modify: `server/src/routes/availabilityRoutes.ts`
- Modify: `server/src/repositories/availabilityRepository.ts`
- Modify: `server/src/repositories/bookingRepository.ts`
- Modify: `server/src/services/publicBookingService.ts`
- Modify: `server/src/repositories/dashboardRepository.ts`
- Modify: `server/src/services/dashboardRules.ts`
- Modify: `server/src/services/dashboardRules.test.ts`

**Interfaces:**
- Produces: `AvailabilityDto { id, date, startTime, endTime, isBooked, clientName }` (no more `locked` field — dropped, see Task 6 for the frontend side of this).
- Produces: `DashboardKpis.bookings: { total: number; online: number; internal: number }` (renamed from `{ total, online, manual }`).
- Produces: `bookingRepository.createWithClaim(availabilityIds, data)` where `data` now requires `source: "ONLINE" | "INTERNAL"`.

- [ ] **Step 1: Edit the Prisma schema**

In `server/prisma/schema.prisma`, add the enum (next to the other enums near the top):

```prisma
enum BookingSource {
  ONLINE
  INTERNAL
}
```

Remove the `clientName` line from `Availability`:

```prisma
model Availability {
  id        Int      @id @default(autoincrement())
  date      DateTime
  startTime String
  endTime   String
  isBooked  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  employee   User @relation(fields: [employeeId], references: [id])
  employeeId Int

  booking   Booking? @relation(fields: [bookingId], references: [id])
  bookingId Int?

  @@unique([employeeId, date, startTime])
  @@index([bookingId])
}
```

Add `source` to `Booking`, right after `clientEmail`:

```prisma
model Booking {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clientName  String
  clientPhone String
  clientEmail String?

  // @default existe só pra migration rodar limpa em cima de reservas já
  // existentes (todas vieram do site). O código sempre passa o valor à mão —
  // nenhum caminho de criação depende do default.
  source BookingSource @default(ONLINE)

  service   Service @relation(fields: [serviceId], references: [id])
  serviceId Int

  availabilities Availability[]
}
```

- [ ] **Step 2: Run the migration**

```bash
cd server
npx prisma migrate dev --name booking_source_and_drop_manual_encaixe
npx prisma generate
```

Expected: migration applies (`ADD COLUMN "source"`, `DROP COLUMN "clientName"` on `Availability`), `@prisma/client` regenerates with `BookingSource` exported and `Availability.clientName` gone from the types.

- [ ] **Step 3: Simplify `availabilityRules.ts`**

Replace the whole file with:

```ts
export interface AvailabilityInput {
  date: string;
  startTime: string;
  endTime: string;
}

export interface AvailabilityData {
  date: Date;
  startTime: string;
  endTime: string;
}

export interface AvailabilityRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  booking: { id: number; clientName: string } | null;
}

export interface AvailabilityDto {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
}

export function toAvailabilityDto(row: AvailabilityRow): AvailabilityDto {
  return {
    id: row.id,
    date: row.date.toISOString(),
    startTime: row.startTime,
    endTime: row.endTime,
    isBooked: row.isBooked,
    clientName: row.booking?.clientName ?? null,
  };
}

// "Hoje" no fuso do servidor: mesma convenção que generateAvailabilities já usa
// para montar Date a partir de "YYYY-MM-DDT00:00:00.000Z". O `date` gravado
// é sempre meia-noite UTC do dia — comparar direto contra `new Date()` sem
// zerar a hora daria "hoje" errado a qualquer hora depois das 00:00 UTC.
export function utcMidnight(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

// "Hoje" pro corte Próximos/Passados usa o fuso do negócio, não o do
// servidor: `date` é sempre meia-noite UTC (um marcador de dia, não um
// instante), mas o servidor roda em UTC enquanto o negócio opera em
// America/Sao_Paulo. Usar utcMidnight(now) direto faz o dia virar às 21h
// local (00h UTC), sumindo "hoje" da aba Próximos horas antes da meia-noite
// real do dono do negócio.
export function businessToday(now: Date): Date {
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(now);
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function totalPagesFor(totalDays: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalDays / pageSize));
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages);
}
```

Note: `normalizeClientName` is intentionally left out of this file for now — it moves to the new `bookingRules.ts` in Task 2, together with its remaining caller (`publicBookingService.ts`). Leaving that one function's relocation for Task 2 keeps this task's blast radius to "kill manual encaixe" only.

Wait — `normalizeClientName` is currently still exported from this file and imported by `publicBookingService.ts`. Deleting it now would break that import before Task 2 fixes it. **Keep `normalizeClientName` in this file for this task** (add it back, unchanged, at the top of the file above):

```ts
export function normalizeClientName(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
```

- [ ] **Step 4: Update `availabilityRules.test.ts`**

Replace the whole file with:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  businessToday,
  clampPage,
  normalizeClientName,
  toAvailabilityDto,
  totalPagesFor,
  utcMidnight,
} from "./availabilityRules";

test("nome com espaços em volta é normalizado", () => {
  assert.equal(normalizeClientName("  Marcos  "), "Marcos");
});

test("nome vazio ou só espaços vira null", () => {
  assert.equal(normalizeClientName(""), null);
  assert.equal(normalizeClientName("   "), null);
  assert.equal(normalizeClientName(null), null);
  assert.equal(normalizeClientName(undefined), null);
});

test("slot livre não tem cliente", () => {
  const dto = toAvailabilityDto({
    id: 1,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
    isBooked: false,
    booking: null,
  });

  assert.equal(dto.clientName, null);
  assert.equal(dto.isBooked, false);
});

test("slot reservado usa o nome do cliente do booking", () => {
  const dto = toAvailabilityDto({
    id: 3,
    date: new Date("2026-08-10T00:00:00.000Z"),
    startTime: "11:00",
    endTime: "12:30",
    isBooked: true,
    booking: { id: 9, clientName: "Cliente Externo" },
  });

  assert.equal(dto.clientName, "Cliente Externo");
  assert.equal(dto.date, "2026-08-10T00:00:00.000Z");
  assert.equal(dto.isBooked, true);
});

test("utcMidnight zera a hora e mantém o dia UTC", () => {
  const result = utcMidnight(new Date("2026-07-25T23:47:12.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("utcMidnight numa data já em meia-noite não muda", () => {
  const result = utcMidnight(new Date("2026-07-25T00:00:00.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("businessToday usa o dia em America/Sao_Paulo, não o dia UTC", () => {
  // 21:30 em São Paulo (UTC-3) já é 00:30 do dia seguinte em UTC.
  const result = businessToday(new Date("2026-07-26T00:30:00.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("businessToday na virada da meia-noite local", () => {
  // 00:30 em São Paulo é 03:30 UTC do mesmo dia.
  const result = businessToday(new Date("2026-07-25T03:30:00.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("totalPagesFor divide exato", () => {
  assert.equal(totalPagesFor(14, 7), 2);
});

test("totalPagesFor arredonda pra cima quando sobra resto", () => {
  assert.equal(totalPagesFor(15, 7), 3);
});

test("totalPagesFor sem dia nenhum ainda devolve 1 página", () => {
  assert.equal(totalPagesFor(0, 7), 1);
});

test("clampPage abaixo de 1 vira 1", () => {
  assert.equal(clampPage(0, 3), 1);
  assert.equal(clampPage(-5, 3), 1);
});

test("clampPage acima do total vira o total", () => {
  assert.equal(clampPage(9, 3), 3);
});

test("clampPage dentro do range não muda", () => {
  assert.equal(clampPage(2, 3), 2);
});
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd server
node --import tsx --test src/services/availabilityRules.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Strip the manual-create path from `availabilityService.ts`**

In `server/src/services/availabilityService.ts`:
- Remove the `import { planAvailabilities } from "./availabilityGenerator";` line's neighbor import of `buildAvailabilityData` — change the import block to:

```ts
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { availabilityRepository, ScheduleDirection } from "../repositories/availabilityRepository";
import { planAvailabilities } from "./availabilityGenerator";
import {
  AvailabilityInput,
  AvailabilityRow,
  clampPage,
  toAvailabilityDto,
  totalPagesFor,
  businessToday,
} from "./availabilityRules";
```

- Delete the entire `createAvailability` method from the `availabilityService` object.
- Rewrite `updateAvailability` to build the data object inline (no more `buildAvailabilityData`):

```ts
  async updateAvailability(employeeId: number, id: number, input: AvailabilityInput) {
    validateTimeRange(input);

    const availability = await findOwnedAvailability(employeeId, id);
    assertNotBooked(availability, "changed");

    const data = {
      date: new Date(input.date),
      startTime: input.startTime,
      endTime: input.endTime,
    };
    const duplicate = await availabilityRepository.findByUniqueSlot(
      employeeId,
      data.date,
      data.startTime,
    );
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError("You already have a time slot starting at this time");
    }

    const updated = await availabilityRepository.update(id, data);
    return toAvailabilityDto(updated);
  },
```

- [ ] **Step 7: Remove `create` from `availabilityRepository.ts`**

In `server/src/repositories/availabilityRepository.ts`, delete the `create(employeeId, data)` method (its only caller was the removed `createAvailability`).

- [ ] **Step 8: Strip the manual-create route from `availabilityController.ts` and `availabilityRoutes.ts`**

In `server/src/controllers/availabilityController.ts`:
- Remove `clientName?: string | null;` from `AvailabilityBody`.
- Delete the `createAvailability` function entirely.

In `server/src/routes/availabilityRoutes.ts`:
- Remove `createAvailability` from the import list.
- Remove `clientName: { type: ["string", "null"], maxLength: 80 },` from `availabilityBodySchema.body.properties`.
- Delete the whole `app.post<{ Body: AvailabilityBody }>("/availabilities", ...)` route registration (the manual single-slot create).

- [ ] **Step 9: Run typecheck to confirm the availability side is clean**

```bash
cd server
npm run typecheck
```

Expected: FAILS only on `dashboardRepository.ts`/`dashboardRules.ts` (still referencing `Availability.clientName`) — that's the next step. If it fails anywhere else, stop and fix before continuing.

- [ ] **Step 10: Update `bookingRepository.ts` to require `source`**

```ts
import { BookingSource } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface BookingData {
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  source: BookingSource;
}

// Sinaliza claim perdido de dentro da transação: precisa ser exceção para o
// Prisma desfazer os slots que já haviam sido marcados nesta tentativa.
class SlotTaken extends Error {}

export const bookingRepository = {
  // Claim atômico do run inteiro: o updateMany só conta os slots que ESTA
  // transação virou de livre para ocupado. Se qualquer um do run já tinha
  // dono, a reserva inteira cai — meia reserva deixaria o serviço sem tempo
  // para terminar. null = outro cliente levou algum dos horários.
  createWithClaim(availabilityIds: number[], data: BookingData) {
    return prisma
      .$transaction(async (tx) => {
        const claimed = await tx.availability.updateMany({
          where: { id: { in: availabilityIds }, isBooked: false },
          data: { isBooked: true },
        });

        if (claimed.count !== availabilityIds.length) {
          throw new SlotTaken();
        }

        const booking = await tx.booking.create({ data });

        await tx.availability.updateMany({
          where: { id: { in: availabilityIds } },
          data: { bookingId: booking.id },
        });

        return booking;
      })
      .catch((error: unknown) => {
        if (error instanceof SlotTaken) return null;
        throw error;
      });
  },
};
```

- [ ] **Step 11: Pass `source: "ONLINE"` from `publicBookingService.ts`**

In `server/src/services/publicBookingService.ts`, inside `createBooking`, add `source: "ONLINE"` to the object passed to `bookingRepository.createWithClaim`:

```ts
    const booking = await bookingRepository.createWithClaim(
      run.map((slotInRun) => slotInRun.id),
      {
        serviceId: service.id,
        clientName,
        clientPhone: input.clientPhone.trim(),
        clientEmail: input.clientEmail?.trim() || null,
        source: "ONLINE",
      },
    );
```

- [ ] **Step 12: Drop `clientName` and add `source` in `dashboardRepository.ts`**

Replace the whole file with:

```ts
import { prisma } from "../lib/prisma";

// Select enxuto de propósito: 90 dias × equipe inteira é dezenas de milhares
// de linhas, e nada além destes campos entra na agregação.
const slotSelect = {
  id: true,
  date: true,
  startTime: true,
  endTime: true,
  isBooked: true,
  employeeId: true,
  booking: {
    // O id é o que permite agrupar os slots de um serviço longo numa reserva
    // só — sem ele, receita e contagem saem dobradas. source distingue
    // reserva do site de reserva feita pela atendente no painel.
    select: {
      id: true,
      clientName: true,
      clientPhone: true,
      source: true,
      service: { select: { id: true, name: true, price: true } },
    },
  },
} as const;

export const dashboardRepository = {
  findSlotsInRange(businessId: number, from: Date, to: Date) {
    return prisma.availability.findMany({
      where: { employee: { businessId }, date: { gte: from, lt: to } },
      select: slotSelect,
    });
  },

  // Query separada da janela: "próximas reservas" é sempre o que vem agora,
  // independente do período que o dono selecionou.
  findUpcomingBooked(businessId: number, from: Date, take: number) {
    return prisma.availability.findMany({
      where: { employee: { businessId }, isBooked: true, date: { gte: from } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        employee: { select: { name: true } },
        booking: {
          select: {
            id: true,
            clientName: true,
            clientPhone: true,
            service: { select: { name: true } },
          },
        },
      },
    });
  },

  countBookingsCreatedBetween(businessId: number, from: Date, to: Date) {
    return prisma.booking.count({
      where: { service: { businessId }, createdAt: { gte: from, lt: to } },
    });
  },
};
```

- [ ] **Step 13: Update `dashboardRules.ts` for the source-based split**

Apply these changes to `server/src/services/dashboardRules.ts`:

Replace the `SlotRow` interface (drop `clientName`, add `source` to the `booking` sub-type):

```ts
// Uma Availability da janela, já com o booking (quando existe) resolvido.
export interface SlotRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  employeeId: number;
  booking: {
    id: number;
    clientName: string;
    clientPhone: string;
    source: "ONLINE" | "INTERNAL";
    service: { id: number; name: string; price: PriceLike };
  } | null;
}
```

Replace the `DashboardKpis` interface's `bookings` field:

```ts
export interface DashboardKpis {
  occupancy: { rate: number; booked: number; total: number };
  bookings: { total: number; online: number; internal: number };
  revenue: { scheduled: string; averageTicket: string };
  pace: { current: number; previous: number };
}
```

Replace `buildKpis`:

```ts
export function buildKpis(
  slots: SlotRow[],
  pace: { current: number; previous: number },
): DashboardKpis {
  const total = slots.length;
  const bookedSlots = slots.filter((slot) => slot.isBooked);
  const bookings = distinctBookings(bookedSlots);
  const online = bookings.filter((booking) => booking.source === "ONLINE").length;
  const internal = bookings.filter((booking) => booking.source === "INTERNAL").length;

  const revenueCents = bookings.reduce(
    (sum, booking) => sum + toCents(booking.service.price),
    0,
  );

  return {
    occupancy: {
      rate: total === 0 ? 0 : bookedSlots.length / total,
      booked: bookedSlots.length,
      total,
    },
    bookings: {
      total: bookings.length,
      online,
      internal,
    },
    revenue: {
      scheduled: formatCents(revenueCents),
      averageTicket:
        bookings.length === 0
          ? "0.00"
          : formatCents(Math.round(revenueCents / bookings.length)),
    },
    pace,
  };
}
```

Update the `UpcomingSlotRow` interface (drop `clientName`):

```ts
// Linha da query dedicada de próximos reservados. Formato diferente de
// SlotRow porque aqui interessa o nome do profissional, não o id.
export interface UpcomingSlotRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  employee: { name: string };
  booking: {
    id: number;
    clientName: string;
    clientPhone: string;
    service: { name: string };
  } | null;
}
```

Update `buildUpcoming`'s mapping (drop the manual-encaixe fallback):

```ts
  return mergeSlotsOfSameBooking(upcoming)
    .slice(0, limit)
    .map((row) => ({
      availabilityId: row.id,
      date: row.date.toISOString().slice(0, 10),
      startTime: row.startTime,
      endTime: row.endTime,
      clientName: row.booking?.clientName ?? "Cliente",
      clientPhone: row.booking?.clientPhone ?? null,
      serviceName: row.booking?.service.name ?? null,
      employeeName: row.employee.name,
    }));
```

(The `?? "Cliente"`/`?? null` stay as defensive fallbacks for the type — `booking` is still nullable in the Prisma-derived type even though, after this task, every `isBooked: true` row always has one.)

- [ ] **Step 14: Rewrite `dashboardRules.test.ts`**

Replace the whole file with:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { SlotRow, buildKpis, formatCents, toCents, bucketOccupancy, buildHeatmap, rankTeam, rankServices, buildUpcoming, buildAlerts, UpcomingSlotRow } from "./dashboardRules";

// Helper local: monta um slot com o mínimo e deixa o teste declarar só o que importa.
function slot(overrides: Partial<SlotRow> = {}): SlotRow {
  return {
    id: 1,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
    isBooked: false,
    employeeId: 1,
    booking: null,
    ...overrides,
  };
}

// Por padrão cada slot carrega uma reserva distinta (id colado no id do slot),
// vinda do site. Slots da MESMA reserva — serviço longo — declaram booking.id
// igual à mão; reserva interna passa source: "INTERNAL" no overrides.
function booked(price: string, overrides: Partial<SlotRow> = {}): SlotRow {
  return slot({
    isBooked: true,
    booking: {
      id: overrides.id ?? 1,
      clientName: "Cliente",
      clientPhone: "11999999999",
      source: "ONLINE",
      service: { id: 1, name: "Corte", price },
    },
    ...overrides,
  });
}

// Uma descoloração de 1h numa grade de 30min: dois slots, uma reserva.
function longBooking(price: string, serviceId = 1): SlotRow[] {
  const booking = {
    id: 77,
    clientName: "Rafael",
    clientPhone: "11999999999",
    source: "ONLINE" as const,
    service: { id: serviceId, name: "Descoloração", price },
  };

  return [
    slot({ id: 1, startTime: "14:00", endTime: "14:30", isBooked: true, booking }),
    slot({ id: 2, startTime: "14:30", endTime: "15:00", isBooked: true, booking }),
  ];
}

function upcomingRow(overrides: Partial<UpcomingSlotRow> = {}): UpcomingSlotRow {
  return {
    id: 1,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "14:00",
    endTime: "15:00",
    employee: { name: "Ana" },
    booking: {
      id: overrides.id ?? 1,
      clientName: "Marcos",
      clientPhone: "11988887777",
      service: { name: "Corte" },
    },
    ...overrides,
  };
}

test("centavos convertem sem erro de float", () => {
  assert.equal(toCents("120.00"), 12000);
  assert.equal(toCents("0.10"), 10);
  assert.equal(toCents("99.99"), 9999);
  assert.equal(formatCents(12000), "120.00");
  assert.equal(formatCents(0), "0.00");
  assert.equal(formatCents(5), "0.05");
});

test("ocupação divide reservados pelo total de horários", () => {
  const kpis = buildKpis(
    [booked("50.00"), slot({ id: 2 }), slot({ id: 3 }), slot({ id: 4 })],
    { current: 0, previous: 0 },
  );

  assert.equal(kpis.occupancy.booked, 1);
  assert.equal(kpis.occupancy.total, 4);
  assert.equal(kpis.occupancy.rate, 0.25);
});

test("sem nenhum horário criado a ocupação é zero, não NaN", () => {
  const kpis = buildKpis([], { current: 0, previous: 0 });

  assert.equal(kpis.occupancy.rate, 0);
  assert.equal(kpis.occupancy.total, 0);
  assert.equal(kpis.revenue.scheduled, "0.00");
  assert.equal(kpis.revenue.averageTicket, "0.00");
});

// Contar por slot ocupado inflava tudo que é "por reserva" assim que um
// serviço passava a ocupar mais de um horário da grade.
test("serviço longo conta como uma reserva só", () => {
  const kpis = buildKpis(longBooking("200.00"), { current: 0, previous: 0 });

  assert.equal(kpis.bookings.total, 1);
  assert.equal(kpis.bookings.online, 1);
  assert.equal(kpis.revenue.scheduled, "200.00");
  assert.equal(kpis.revenue.averageTicket, "200.00");
});

// Ocupação é a exceção: os dois slots estão de fato tomados na agenda.
test("serviço longo ocupa os dois slots na taxa de ocupação", () => {
  const kpis = buildKpis(
    [...longBooking("200.00"), slot({ id: 3 }), slot({ id: 4 })],
    { current: 0, previous: 0 },
  );

  assert.equal(kpis.occupancy.booked, 2);
  assert.equal(kpis.occupancy.total, 4);
  assert.equal(kpis.occupancy.rate, 0.5);
});

test("reserva interna conta separado da reserva do site", () => {
  const online = booked("50.00", { id: 1 });
  const internal = booked("30.00", {
    id: 2,
    booking: {
      id: 2,
      clientName: "Rafael",
      clientPhone: "11999999999",
      source: "INTERNAL",
      service: { id: 2, name: "Barba", price: "30.00" },
    },
  });

  const kpis = buildKpis([online, internal], { current: 0, previous: 0 });

  assert.equal(kpis.bookings.total, 2);
  assert.equal(kpis.bookings.online, 1);
  assert.equal(kpis.bookings.internal, 1);
  assert.equal(kpis.revenue.scheduled, "80.00");
});

test("ritmo repassa as contagens de reservas criadas", () => {
  const kpis = buildKpis([], { current: 12, previous: 8 });

  assert.equal(kpis.pace.current, 12);
  assert.equal(kpis.pace.previous, 8);
});

test("janela de 7 dias gera um bucket por dia, inclusive dias vazios", () => {
  const from = new Date("2026-07-25T00:00:00.000Z"); // sábado
  const buckets = bucketOccupancy(
    [
      booked("50.00", { date: new Date("2026-07-25T00:00:00.000Z") }),
      slot({ id: 2, date: new Date("2026-07-25T00:00:00.000Z") }),
      slot({ id: 3, date: new Date("2026-07-27T00:00:00.000Z") }),
    ],
    7,
    from,
  );

  assert.equal(buckets.length, 7);
  assert.equal(buckets[0].key, "2026-07-25");
  assert.equal(buckets[0].label, "sáb 25");
  assert.equal(buckets[0].booked, 1);
  assert.equal(buckets[0].free, 1);
  assert.equal(buckets[1].booked, 0);
  assert.equal(buckets[1].free, 0);
  assert.equal(buckets[2].free, 1);
});

test("janela de 30 dias agrupa por semana", () => {
  const from = new Date("2026-07-25T00:00:00.000Z");
  const buckets = bucketOccupancy(
    [
      slot({ date: new Date("2026-07-26T00:00:00.000Z") }),
      slot({ id: 2, date: new Date("2026-08-05T00:00:00.000Z") }),
    ],
    30,
    from,
  );

  assert.equal(buckets.length, 5); // ceil(30 / 7)
  assert.equal(buckets[0].key, "2026-07-25"); // 25–31 jul
  assert.equal(buckets[0].free, 1);
  assert.equal(buckets[1].key, "2026-08-01"); // 1–7 ago
  assert.equal(buckets[1].label, "1–7 ago");
  assert.equal(buckets[1].free, 1); // o slot de 05/08 cai nesta semana
  assert.equal(buckets[2].free, 0);
});

test("semana que cruza o mês mostra os dois meses no rótulo", () => {
  const buckets = bucketOccupancy([], 30, new Date("2026-07-28T00:00:00.000Z"));

  assert.equal(buckets[0].label, "28 jul–3 ago");
});

test("mapa de calor agrupa por dia da semana e hora, em UTC", () => {
  const cells = buildHeatmap([
    booked("50.00", { date: new Date("2026-07-27T00:00:00.000Z"), startTime: "09:00" }),
    slot({ id: 2, date: new Date("2026-07-27T00:00:00.000Z"), startTime: "09:30" }),
    slot({ id: 3, date: new Date("2026-07-28T00:00:00.000Z"), startTime: "14:00" }),
  ]);

  assert.equal(cells.length, 2);
  assert.deepEqual(cells[0], { weekday: 1, hour: 9, booked: 1, total: 2 });
  assert.deepEqual(cells[1], { weekday: 2, hour: 14, booked: 0, total: 1 });
});

test("mapa de calor não emite célula sem nenhum horário", () => {
  assert.deepEqual(buildHeatmap([]), []);
});

test("todo colaborador aparece no ranking, mesmo sem agenda aberta", () => {
  const rows = rankTeam(
    [booked("50.00", { employeeId: 1 }), slot({ id: 2, employeeId: 1 })],
    [
      { id: 1, name: "Ana", pendingInvite: false, serviceIds: [1] },
      { id: 2, name: "Bruno", pendingInvite: false, serviceIds: [] },
    ],
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Ana");
  assert.equal(rows[0].slots, 2);
  assert.equal(rows[0].booked, 1);
  assert.equal(rows[0].rate, 0.5);
  assert.equal(rows[0].revenue, "50.00");

  assert.equal(rows[1].name, "Bruno");
  assert.equal(rows[1].slots, 0);
  assert.equal(rows[1].rate, 0);
});

test("quem não tem agenda vai para o fim, mesmo com ocupação teórica maior", () => {
  const rows = rankTeam(
    [slot({ employeeId: 2 }), slot({ id: 2, employeeId: 2 })],
    [
      { id: 1, name: "Ana", pendingInvite: false, serviceIds: [] },
      { id: 2, name: "Bruno", pendingInvite: false, serviceIds: [] },
    ],
  );

  assert.equal(rows[0].name, "Bruno"); // tem agenda, ocupação 0
  assert.equal(rows[1].name, "Ana"); // sem agenda
});

test("ranking da equipe ordena por ocupação decrescente", () => {
  const rows = rankTeam(
    [
      booked("10.00", { employeeId: 1 }),
      slot({ id: 2, employeeId: 1 }),
      booked("10.00", { id: 3, employeeId: 2 }),
      booked("10.00", { id: 4, employeeId: 2 }),
    ],
    [
      { id: 1, name: "Ana", pendingInvite: false, serviceIds: [] },
      { id: 2, name: "Bruno", pendingInvite: false, serviceIds: [] },
    ],
  );

  assert.equal(rows[0].name, "Bruno");
  assert.equal(rows[0].rate, 1);
  assert.equal(rows[1].name, "Ana");
});

test("serviços rankeiam por receita e o share soma 1", () => {
  const corte = (id: number) =>
    booked("30.00", { id, booking: {
      id,
      clientName: "C", clientPhone: "1", source: "ONLINE",
      service: { id: 1, name: "Corte", price: "30.00" },
    } });
  const barba = booked("70.00", { id: 9, booking: {
    id: 9,
    clientName: "C", clientPhone: "1", source: "ONLINE",
    service: { id: 2, name: "Barba", price: "70.00" },
  } });

  const rows = rankServices([corte(1), corte(2), barba]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Barba");
  assert.equal(rows[0].bookings, 1);
  assert.equal(rows[0].revenue, "70.00");
  assert.equal(rows[1].name, "Corte");
  assert.equal(rows[1].bookings, 2);
  assert.equal(rows[1].revenue, "60.00");
  assert.equal(Math.round((rows[0].share + rows[1].share) * 100), 100);
});

test("serviço longo entra uma vez no ranking de serviços", () => {
  const rows = rankServices(longBooking("200.00", 5));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bookings, 1);
  assert.equal(rows[0].revenue, "200.00");
});

test("serviço longo não dobra a receita do colaborador", () => {
  const rows = rankTeam(longBooking("200.00"), [
    { id: 1, name: "Samuel", pendingInvite: false, serviceIds: [1] },
  ]);

  assert.equal(rows[0].revenue, "200.00");
  assert.equal(rows[0].booked, 2); // ocupação segue por slot
});

test("serviços com receita zero têm share zero, não NaN", () => {
  const rows = rankServices([
    booked("0.00", { booking: {
      id: 1,
      clientName: "C", clientPhone: "1", source: "ONLINE",
      service: { id: 1, name: "Cortesia", price: "0.00" },
    } }),
  ]);

  assert.equal(rows[0].share, 0);
  assert.equal(rows[0].revenue, "0.00");
});

test("reserva interna entra no ranking de serviços igual à do site", () => {
  const rows = rankServices([
    booked("40.00", { booking: {
      id: 1,
      clientName: "C", clientPhone: "1", source: "INTERNAL",
      service: { id: 1, name: "Corte", price: "40.00" },
    } }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].revenue, "40.00");
});

test("próxima reserva expõe cliente, telefone, serviço e profissional", () => {
  const rows = buildUpcoming([upcomingRow()], new Date("2026-07-25T10:00:00"), 8);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    availabilityId: 1,
    date: "2026-07-25",
    startTime: "14:00",
    endTime: "15:00",
    clientName: "Marcos",
    clientPhone: "11988887777",
    serviceName: "Corte",
    employeeName: "Ana",
  });
});

// Sem agrupar, o dono via a mesma descoloração duas vezes na lista de
// próximas reservas — uma por slot da grade.
test("reserva longa aparece uma vez e vai até o fim do atendimento", () => {
  const descoloracao = {
    id: 77,
    clientName: "Rafael",
    clientPhone: "11988887777",
    service: { name: "Descoloração" },
  };

  const rows = buildUpcoming(
    [
      upcomingRow({ id: 1, startTime: "14:00", endTime: "14:30", booking: descoloracao }),
      upcomingRow({ id: 2, startTime: "14:30", endTime: "15:00", booking: descoloracao }),
    ],
    new Date("2026-07-25T10:00:00"),
    8,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].availabilityId, 1);
  assert.equal(rows[0].startTime, "14:00");
  assert.equal(rows[0].endTime, "15:00");
});

test("slot de hoje que já passou não entra em próximas reservas", () => {
  const rows = buildUpcoming(
    [
      upcomingRow({ id: 1, startTime: "08:00", endTime: "09:00" }),
      upcomingRow({ id: 2, startTime: "16:00", endTime: "17:00" }),
    ],
    new Date("2026-07-25T10:00:00"),
    8,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].availabilityId, 2);
});

test("próximas reservas respeitam o limite e a ordem cronológica", () => {
  const rows = buildUpcoming(
    [
      upcomingRow({ id: 2, date: new Date("2026-07-26T00:00:00.000Z"), startTime: "09:00" }),
      upcomingRow({ id: 1, startTime: "16:00" }),
      upcomingRow({ id: 3, date: new Date("2026-07-27T00:00:00.000Z"), startTime: "09:00" }),
    ],
    new Date("2026-07-25T10:00:00"),
    2,
  );

  assert.deepEqual(rows.map((r) => r.availabilityId), [1, 2]);
});

const from = new Date("2026-07-25T00:00:00.000Z");

test("alerta lista colaboradores sem nenhum horário aberto", () => {
  const alerts = buildAlerts(
    [slot({ employeeId: 1 })],
    [
      { id: 1, name: "Ana", pendingInvite: false, serviceIds: [1] },
      { id: 2, name: "Bruno", pendingInvite: false, serviceIds: [1] },
    ],
    [{ id: 1, name: "Corte" }],
    7,
  );

  const alert = alerts.find((a) => a.kind === "employee-no-slots");
  assert.equal(alert?.count, 1);
  assert.equal(alert?.label, "1 colaborador sem horários abertos nos próximos 7 dias");
});

test("alerta lista serviços sem profissional vinculado", () => {
  const alerts = buildAlerts(
    [],
    [{ id: 1, name: "Ana", pendingInvite: false, serviceIds: [1] }],
    [{ id: 1, name: "Corte" }, { id: 2, name: "Barba" }],
    7,
  );

  const alert = alerts.find((a) => a.kind === "service-no-employee");
  assert.equal(alert?.count, 1);
  assert.equal(alert?.label, "1 serviço sem profissional vinculado");
});

test("alerta conta dias sem nenhum horário livre", () => {
  const alerts = buildAlerts(
    [
      slot({ id: 1, isBooked: true, date: from }),
      slot({ id: 2, isBooked: true, date: from }),
      slot({ id: 3, date: new Date("2026-07-26T00:00:00.000Z") }),
    ],
    [{ id: 1, name: "Ana", pendingInvite: false, serviceIds: [] }],
    [],
    7,
  );

  const alert = alerts.find((a) => a.kind === "day-fully-booked");
  assert.equal(alert?.count, 1);
  assert.equal(alert?.label, "1 dia sem nenhum horário livre");
});

test("alerta conta convites pendentes", () => {
  const alerts = buildAlerts(
    [],
    [{ id: 1, name: "Ana", pendingInvite: true, serviceIds: [] }],
    [],
    7,
  );

  const alert = alerts.find((a) => a.kind === "pending-invite");
  assert.equal(alert?.count, 1);
  assert.equal(alert?.label, "1 convite pendente");
});

test("negócio saudável não gera alerta nenhum", () => {
  const alerts = buildAlerts(
    [slot({ employeeId: 1 })],
    [{ id: 1, name: "Ana", pendingInvite: false, serviceIds: [1] }],
    [{ id: 1, name: "Corte" }],
    7,
  );

  assert.deepEqual(alerts, []);
});
```

- [ ] **Step 15: Run the dashboard tests**

```bash
cd server
node --import tsx --test src/services/dashboardRules.test.ts
```

Expected: all tests PASS.

- [ ] **Step 16: Full server typecheck + test suite**

```bash
cd server
npm run typecheck
npm test
```

Expected: both green.

- [ ] **Step 17: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/src/services/availabilityRules.ts server/src/services/availabilityRules.test.ts server/src/services/availabilityService.ts server/src/controllers/availabilityController.ts server/src/routes/availabilityRoutes.ts server/src/repositories/availabilityRepository.ts server/src/repositories/bookingRepository.ts server/src/services/publicBookingService.ts server/src/repositories/dashboardRepository.ts server/src/services/dashboardRules.ts server/src/services/dashboardRules.test.ts
git commit -m "feat(server): drop manual encaixe workaround, add Booking.source"
```

---

### Task 2: Extract shared booking rules into `bookingRules.ts`

Pure mechanical extraction — no behavior change. `isSlotUpcoming`, `nextSlotPerEmployee`, `slotRunForDuration`, `slotsFittingDuration`, `serviceEndTime` are slot-matching rules, not "public booking" rules; `internalBookingService` (Task 4) needs them too.

**Files:**
- Create: `server/src/services/bookingRules.ts`
- Create: `server/src/services/bookingRules.test.ts`
- Modify: `server/src/services/publicBookingRules.ts`
- Modify: `server/src/services/publicBookingRules.test.ts`
- Modify: `server/src/services/availabilityRules.ts` (remove `normalizeClientName`, now duplicated in `bookingRules.ts`)
- Modify: `server/src/services/availabilityRules.test.ts` (remove the two `normalizeClientName` tests, now duplicated in `bookingRules.test.ts`)
- Modify: `server/src/services/publicBookingService.ts` (update imports)
- Modify: `server/src/services/dashboardRules.ts` (update `isSlotUpcoming` import path)

**Interfaces:**
- Produces: `bookingRules.ts` exporting `normalizeClientName`, `isSlotUpcoming`, `DurationSlot`, `EmployeeSlot`, `NextSlot`, `nextSlotPerEmployee`, `serviceEndTime`, `slotRunForDuration`, `slotsFittingDuration`.
- Consumes (Task 1): nothing new, this is a pure refactor of already-passing code.

- [ ] **Step 1: Create `bookingRules.ts`**

```ts
import { toMinutes, toTime } from "../lib/time";

export function normalizeClientName(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// A data do slot é meia-noite UTC; "hoje" vem do relógio local do servidor.
// Produto opera num único fuso — decisão registrada no spec.
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

export interface DurationSlot {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
}

export interface EmployeeSlot extends DurationSlot {
  employeeId: number;
}

export interface NextSlot {
  date: string;
  startTime: string;
}

// Próxima vaga de cada profissional em que um serviço de `durationMinutes`
// cabe inteiro. Duração 0 = "qualquer horário livre", que é o que o card do
// profissional mostra enquanto o cliente ainda não escolheu o serviço.
//
// Slots chegam ordenados por data/hora; quem não tem vaga à frente fica fora
// do mapa e a tela mostra "sem vagas".
export function nextSlotPerEmployee(
  slots: EmployeeSlot[],
  durationMinutes: number,
  now: Date,
): Map<number, NextSlot> {
  const byEmployee = new Map<number, EmployeeSlot[]>();

  for (const slot of slots) {
    if (!isSlotUpcoming(slot, now)) continue;
    const own = byEmployee.get(slot.employeeId) ?? [];
    own.push(slot);
    byEmployee.set(slot.employeeId, own);
  }

  const map = new Map<number, NextSlot>();

  for (const [employeeId, own] of byEmployee) {
    const first = own.find(
      (slot) => slotRunForDuration(own, slot.id, durationMinutes) !== null,
    );
    if (!first) continue;

    map.set(employeeId, {
      date: first.date.toISOString(),
      startTime: first.startTime,
    });
  }

  return map;
}

export function serviceEndTime(startTime: string, durationMinutes: number): string {
  return toTime(toMinutes(startTime) + durationMinutes);
}

// A grade do colaborador é fixa, mas o serviço tem a duração que tem: um
// atendimento mais longo que o slot avança sobre os seguintes. O run só existe
// se esses vizinhos estiverem livres, colados e no mesmo dia — e sobra da
// grade é perdida, porque ninguém é atendido nos minutos que restam.
//
// `slots` precisa vir ordenado por data/hora e conter apenas horários livres:
// um slot reservado simplesmente não está na lista, e o run morre no buraco.
export function slotRunForDuration<T extends DurationSlot>(
  slots: T[],
  startSlotId: number,
  durationMinutes: number,
): T[] | null {
  const index = slots.findIndex((slot) => slot.id === startSlotId);
  if (index === -1) return null;

  const first = slots[index];
  const target = toMinutes(first.startTime) + durationMinutes;

  const run: T[] = [];
  let covered = toMinutes(first.startTime);

  for (let cursor = index; cursor < slots.length; cursor += 1) {
    const slot = slots[cursor];

    if (slot.date.getTime() !== first.date.getTime()) break;
    if (toMinutes(slot.startTime) !== covered) break; // buraco na grade

    run.push(slot);
    covered = toMinutes(slot.endTime);

    if (covered >= target) return run;
  }

  return null;
}

// O cliente só enxerga horários em que o serviço cabe inteiro — é o que
// impede marcar 09:00 de descoloração com a barba das 09:30 já reservada.
export function slotsFittingDuration<T extends DurationSlot>(
  slots: T[],
  durationMinutes: number,
): T[] {
  return slots.filter(
    (slot) => slotRunForDuration(slots, slot.id, durationMinutes) !== null,
  );
}
```

- [ ] **Step 2: Create `bookingRules.test.ts`**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextSlotPerEmployee,
  isSlotUpcoming,
  serviceEndTime,
  slotRunForDuration,
  slotsFittingDuration,
} from "./bookingRules";

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

// Slot de meia hora, do jeito que o gerador cria.
function freeSlot(
  id: number,
  employeeId: number,
  date: string,
  startTime: string,
  endTime: string,
) {
  return { id, employeeId, date: new Date(`${date}T00:00:00.000Z`), startTime, endTime };
}

test("primeiro slot futuro por profissional", () => {
  const map = nextSlotPerEmployee(
    [
      freeSlot(1, 13, "2026-07-23", "09:00", "09:30"),
      freeSlot(2, 13, "2026-07-25", "14:00", "14:30"),
      freeSlot(3, 13, "2026-07-26", "09:00", "09:30"),
      freeSlot(4, 14, "2026-07-27", "10:00", "10:30"),
    ],
    0,
    now,
  );

  assert.deepEqual(map.get(13), {
    date: "2026-07-25T00:00:00.000Z",
    startTime: "14:00",
  });
  assert.deepEqual(map.get(14), {
    date: "2026-07-27T00:00:00.000Z",
    startTime: "10:00",
  });
});

test("profissional sem slot futuro fica de fora do mapa", () => {
  const map = nextSlotPerEmployee(
    [freeSlot(1, 99, "2026-07-20", "09:00", "09:30")],
    0,
    now,
  );

  assert.equal(map.has(99), false);
});

test("próximo horário pula o que não comporta a duração do serviço", () => {
  const map = nextSlotPerEmployee(
    [
      freeSlot(1, 13, "2026-07-27", "09:00", "09:30"),
      freeSlot(2, 13, "2026-07-27", "10:00", "10:30"),
      freeSlot(3, 13, "2026-07-27", "10:30", "11:00"),
    ],
    60,
    now,
  );

  assert.equal(map.get(13)?.startTime, "10:00");
});

test("profissional sem espaço para o serviço fica de fora do mapa", () => {
  const map = nextSlotPerEmployee(
    [freeSlot(1, 13, "2026-07-27", "09:00", "09:30")],
    60,
    now,
  );

  assert.equal(map.has(13), false);
});

test("fim do serviço atravessa a hora cheia", () => {
  assert.equal(serviceEndTime("09:45", 30), "10:15");
  assert.equal(serviceEndTime("09:00", 45), "09:45");
});

// Grade de 30min do colaborador: um dia inteiro de slots livres contíguos.
function grid(times: string[], date = "2026-07-27"): {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
}[] {
  return times.map((startTime, index) => {
    const [hours, minutes] = startTime.split(":").map(Number);
    const end = hours * 60 + minutes + 30;
    return {
      id: index + 1,
      date: new Date(`${date}T00:00:00.000Z`),
      startTime,
      endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    };
  });
}

test("serviço que cabe num slot ocupa só ele", () => {
  const slots = grid(["09:00", "09:30", "10:00"]);
  const run = slotRunForDuration(slots, 1, 30);

  assert.deepEqual(run?.map((slot) => slot.startTime), ["09:00"]);
});

test("serviço de 1h ocupa dois slots consecutivos", () => {
  const slots = grid(["09:00", "09:30", "10:00"]);
  const run = slotRunForDuration(slots, 1, 60);

  assert.deepEqual(run?.map((slot) => slot.startTime), ["09:00", "09:30"]);
});

// 45min numa grade de 30 consome o slot seguinte inteiro: o colaborador não
// consegue atender ninguém nos 15min que sobram.
test("duração que não fecha na grade arredonda para cima", () => {
  const slots = grid(["09:00", "09:30", "10:00"]);
  const run = slotRunForDuration(slots, 1, 45);

  assert.deepEqual(run?.map((slot) => slot.startTime), ["09:00", "09:30"]);
});

// O caso do bug: 09:30 já reservado, então some da lista de livres e o
// serviço de 1h não tem como começar 09:00.
test("serviço não cabe quando o slot seguinte já está reservado", () => {
  const slots = grid(["09:00", "10:00", "10:30"]);

  assert.equal(slotRunForDuration(slots, 1, 60), null);
});

test("serviço não cabe quando há intervalo entre os slots", () => {
  const slots = [
    ...grid(["09:00"]),
    { id: 2, date: new Date("2026-07-27T00:00:00.000Z"), startTime: "09:40", endTime: "10:10" },
  ];

  assert.equal(slotRunForDuration(slots, 1, 60), null);
});

test("serviço não cabe no último slot do expediente", () => {
  const slots = grid(["17:30"]);

  assert.equal(slotRunForDuration(slots, 1, 60), null);
});

test("run não atravessa a virada do dia", () => {
  const slots = [
    ...grid(["17:30"], "2026-07-27"),
    ...grid(["09:00"], "2026-07-28"),
  ];

  assert.equal(slotRunForDuration(slots, 1, 60), null);
});

test("slot inexistente não vira run", () => {
  assert.equal(slotRunForDuration(grid(["09:00", "09:30"]), 99, 30), null);
});

test("listagem esconde horários onde o serviço não cabe", () => {
  const slots = grid(["09:00", "10:00", "10:30", "11:00"]);
  const fitting = slotsFittingDuration(slots, 60);

  assert.deepEqual(fitting.map((slot) => slot.startTime), ["10:00", "10:30"]);
});

test("serviço curto mantém todos os horários livres", () => {
  const slots = grid(["09:00", "10:00"]);

  assert.deepEqual(slotsFittingDuration(slots, 30).map((slot) => slot.id), [1, 2]);
});
```

- [ ] **Step 3: Run the new test file**

```bash
cd server
node --import tsx --test src/services/bookingRules.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Trim `publicBookingRules.ts`**

Replace the whole file with:

```ts
import {
  EmployeeSlot,
  NextSlot,
  nextSlotPerEmployee,
  serviceEndTime,
} from "./bookingRules";

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

export interface PublicEmployeeDto {
  id: number;
  name: string;
  nextSlot: NextSlot | null;
}

export interface PublicBusinessDto {
  business: { name: string; slug: string; address: string | null };
  professionals: PublicEmployeeDto[];
  services: {
    id: number;
    name: string;
    duration: number;
    price: string;
    employees: PublicEmployeeDto[];
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

// Serviço sem profissional vinculado sai do catálogo: o cliente não pode
// escolher um caminho sem horário possível.
export function toPublicBusinessDto(
  business: { name: string; slug: string; address?: string | null },
  services: CatalogService[],
  freeSlots: EmployeeSlot[],
  now: Date,
): PublicBusinessDto {
  const visible = services.filter((service) => service.employees.length > 0);

  const withNextSlot =
    (nextSlots: Map<number, NextSlot>) =>
    (employee: { id: number; name: string }): PublicEmployeeDto => ({
      id: employee.id,
      name: employee.name,
      nextSlot: nextSlots.get(employee.id) ?? null,
    });

  // Sem serviço escolhido ainda, o card do profissional mostra a primeira
  // vaga qualquer — é só uma prévia de quando ele volta a atender.
  const anySlot = withNextSlot(nextSlotPerEmployee(freeSlots, 0, now));

  // Profissionais do topo: união dos serviços visíveis, na ordem de primeira
  // aparição, sem repetir quem atende mais de um serviço.
  const professionals = new Map<number, PublicEmployeeDto>();
  for (const service of visible) {
    for (const employee of service.employees) {
      if (!professionals.has(employee.id)) {
        professionals.set(employee.id, anySlot(employee));
      }
    }
  }

  return {
    business: {
      name: business.name,
      slug: business.slug,
      address: business.address ?? null,
    },
    professionals: [...professionals.values()],
    // Cada serviço anuncia a próxima vaga em que ELE cabe: uma descoloração
    // de 1h não pode prometer um buraco de 30min entre dois compromissos.
    services: visible.map((service) => {
      const fits = withNextSlot(
        nextSlotPerEmployee(freeSlots, service.duration, now),
      );

      return {
        id: service.id,
        name: service.name,
        duration: service.duration,
        price: service.price.toString(),
        employees: service.employees.map(fits),
      };
    }),
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

// O fim que o cliente lê é o do serviço, não o do slot onde ele começou:
// uma descoloração de 1h numa grade de 30min termina 15:00, não 14:30.
export function buildBookingSummary(args: {
  businessName: string;
  service: { name: string; duration: number; price: PriceLike };
  employeeName: string;
  slot: { date: Date; startTime: string };
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
    endTime: serviceEndTime(args.slot.startTime, args.service.duration),
    clientName: args.clientName,
  };
}
```

- [ ] **Step 5: Trim `publicBookingRules.test.ts`**

Replace the whole file with (only the DTO-building tests stay — the slot-matching tests moved to `bookingRules.test.ts` in Step 2):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBookingSummary,
  toPublicBusinessDto,
  toPublicSlotDto,
} from "./publicBookingRules";

// now fixo: 2026-07-24 14:30 local
const now = new Date(2026, 6, 24, 14, 30);

function freeSlot(
  id: number,
  employeeId: number,
  date: string,
  startTime: string,
  endTime: string,
) {
  return { id, employeeId, date: new Date(`${date}T00:00:00.000Z`), startTime, endTime };
}

test("catálogo público omite serviço sem profissional e anexa próximo horário", () => {
  const dto = toPublicBusinessDto(
    { name: "old-brothers", slug: "old-brothers" },
    [
      {
        id: 1,
        name: "Corte",
        duration: 30,
        price: "50",
        employees: [
          { id: 13, name: "Derek" },
          { id: 14, name: "Tiago" },
        ],
      },
      { id: 2, name: "Fantasma", duration: 20, price: "10", employees: [] },
    ],
    [freeSlot(1, 13, "2026-07-25", "14:00", "14:30")],
    now,
  );

  assert.equal(dto.business.name, "old-brothers");
  assert.deepEqual(
    dto.services.map((s) => s.id),
    [1],
  );
  assert.equal(dto.services[0].price, "50");
  assert.deepEqual(dto.services[0].employees, [
    { id: 13, name: "Derek", nextSlot: { date: "2026-07-25T00:00:00.000Z", startTime: "14:00" } },
    { id: 14, name: "Tiago", nextSlot: null },
  ]);
  // profissionais no topo: união dos serviços visíveis, sem repetir
  assert.deepEqual(
    dto.professionals.map((p) => p.id),
    [13, 14],
  );
});

// Cada card de serviço promete um horário; a promessa tem que valer para
// AQUELE serviço, não para "qualquer coisa que caiba em meia hora".
test("cada serviço anuncia o próximo horário em que ele próprio cabe", () => {
  const dto = toPublicBusinessDto(
    { name: "old-brothers", slug: "old-brothers" },
    [
      { id: 1, name: "Barba", duration: 30, price: "35", employees: [{ id: 13, name: "Samuel" }] },
      {
        id: 2,
        name: "Descoloração",
        duration: 60,
        price: "200",
        employees: [{ id: 13, name: "Samuel" }],
      },
    ],
    [
      freeSlot(1, 13, "2026-07-27", "09:00", "09:30"),
      freeSlot(2, 13, "2026-07-27", "10:00", "10:30"),
      freeSlot(3, 13, "2026-07-27", "10:30", "11:00"),
    ],
    now,
  );

  assert.equal(dto.services[0].employees[0].nextSlot?.startTime, "09:00");
  assert.equal(dto.services[1].employees[0].nextSlot?.startTime, "10:00");
  // Sem serviço escolhido, o card do profissional mostra a primeira vaga.
  assert.equal(dto.professionals[0].nextSlot?.startTime, "09:00");
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
    slot: { date: new Date("2026-07-25T00:00:00.000Z"), startTime: "09:00" },
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
    endTime: "09:30",
    clientName: "Marcos",
  });
});

// O fim do atendimento é o serviço que dita, não o slot da grade: era daqui
// que saía "1h · 14:00 – 14:30" na tela de confirmação.
test("resumo termina no fim do serviço, não no fim do slot", () => {
  const summary = buildBookingSummary({
    businessName: "old-brothers",
    service: { name: "Descoloração", duration: 60, price: "200" },
    employeeName: "Samuel",
    slot: { date: new Date("2026-07-27T00:00:00.000Z"), startTime: "14:00" },
    clientName: "Rafael",
  });

  assert.equal(summary.startTime, "14:00");
  assert.equal(summary.endTime, "15:00");
});
```

- [ ] **Step 6: Run both test files**

```bash
cd server
node --import tsx --test src/services/publicBookingRules.test.ts src/services/bookingRules.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Remove `normalizeClientName` from `availabilityRules.ts`/`availabilityRules.test.ts`**

In `availabilityRules.ts`, delete the `normalizeClientName` function (now only in `bookingRules.ts`).

In `availabilityRules.test.ts`, delete the two tests that import/test `normalizeClientName`, and remove `normalizeClientName` from the import list.

- [ ] **Step 8: Update `publicBookingService.ts` imports**

Change:

```ts
import { normalizeClientName } from "./availabilityRules";
import {
  buildBookingSummary,
  isSlotUpcoming,
  slotRunForDuration,
  slotsFittingDuration,
  toPublicBusinessDto,
  toPublicSlotDto,
} from "./publicBookingRules";
```

to:

```ts
import {
  isSlotUpcoming,
  normalizeClientName,
  slotRunForDuration,
  slotsFittingDuration,
} from "./bookingRules";
import {
  buildBookingSummary,
  toPublicBusinessDto,
  toPublicSlotDto,
} from "./publicBookingRules";
```

- [ ] **Step 9: Update `dashboardRules.ts`'s import**

Change the top of `dashboardRules.ts` from:

```ts
import { isSlotUpcoming } from "./publicBookingRules";
```

to:

```ts
import { isSlotUpcoming } from "./bookingRules";
```

- [ ] **Step 10: Full server typecheck + test suite**

```bash
cd server
npm run typecheck
npm test
```

Expected: both green.

- [ ] **Step 11: Commit**

```bash
git add server/src/services/bookingRules.ts server/src/services/bookingRules.test.ts server/src/services/publicBookingRules.ts server/src/services/publicBookingRules.test.ts server/src/services/availabilityRules.ts server/src/services/availabilityRules.test.ts server/src/services/publicBookingService.ts server/src/services/dashboardRules.ts
git commit -m "refactor(server): extract shared slot-matching rules into bookingRules.ts"
```

---

### Task 3: Extract the shared booking-creation core into `bookingService.ts`

`publicBookingService.createBooking` today mixes "resolve the business by slug" with "find service/slot, check it's offered, check it fits, claim it" — the second half is exactly what `internalBookingService` (Task 4) needs, just resolving the business a different way and shaping the response differently.

**Files:**
- Create: `server/src/services/bookingService.ts`
- Modify: `server/src/services/publicBookingService.ts`

**Interfaces:**
- Produces: `bookingService.createBookingForBusiness(businessId: number, input: CreateBookingInput, now: Date, source: BookingSource): Promise<{ booking: Booking; service: Service; slot: AvailabilityWithEmployee; employeeName: string; clientName: string }>` — throws `NotFoundError`/`ConflictError` exactly like the current `publicBookingService.createBooking` did.
- Consumes: `bookingRules.ts` (`isSlotUpcoming`, `normalizeClientName`, `slotRunForDuration`), `bookingRepository.createWithClaim` (Task 1's `source`-aware signature), `employeeRepository.hasServiceLink`, `serviceRepository.findById`, `availabilityRepository.findByIdForBooking`/`findManyFreeByEmployee`.

- [ ] **Step 1: Create `bookingService.ts`**

```ts
import { BookingSource } from "@prisma/client";
import { ConflictError, NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";
import { bookingRepository } from "../repositories/bookingRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import { isSlotUpcoming, normalizeClientName, slotRunForDuration } from "./bookingRules";

export interface CreateBookingInput {
  availabilityId: number;
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
}

// Núcleo de "cria uma reserva de verdade", compartilhado pelo fluxo público
// (o cliente escolhe pra si) e pelo interno (a atendente escolhe pro
// cliente na loja). O que muda entre os dois é só como o `businessId` é
// resolvido e como a resposta é formatada — a validação e o claim atômico
// do slot são exatamente os mesmos nos dois casos.
export async function createBookingForBusiness(
  businessId: number,
  input: CreateBookingInput,
  now: Date,
  source: BookingSource,
) {
  const service = await serviceRepository.findById(input.serviceId);
  if (!service || service.businessId !== businessId) {
    throw new NotFoundError("Service not found");
  }

  const slot = await availabilityRepository.findByIdForBooking(input.availabilityId);
  if (!slot || slot.employee.businessId !== businessId) {
    throw new NotFoundError("Time slot not found");
  }

  const offers = await employeeRepository.hasServiceLink(slot.employee.id, service.id);
  if (!offers) {
    throw new ConflictError("This professional does not offer this service");
  }

  if (!isSlotUpcoming(slot, now)) {
    throw new ConflictError("This time slot is no longer available");
  }

  if (slot.isBooked) {
    throw new ConflictError("This time slot has just been booked");
  }

  const clientName = normalizeClientName(input.clientName);
  if (!clientName) {
    throw new ConflictError("Client name is required");
  }

  // O cliente (ou a atendente, no fluxo interno) escolhe onde COMEÇA; quem
  // decide onde termina é a duração do serviço. Revalidamos o run no servidor
  // porque a lista que foi mostrada pode ter envelhecido entre a escolha e o
  // envio.
  const free = await availabilityRepository.findManyFreeByEmployee(slot.employee.id);
  const run = slotRunForDuration(
    free.filter((candidate) => isSlotUpcoming(candidate, now)),
    slot.id,
    service.duration,
  );
  if (!run) {
    throw new ConflictError("This service does not fit in the selected time slot");
  }

  const booking = await bookingRepository.createWithClaim(
    run.map((slotInRun) => slotInRun.id),
    {
      serviceId: service.id,
      clientName,
      clientPhone: input.clientPhone.trim(),
      clientEmail: input.clientEmail?.trim() || null,
      source,
    },
  );
  if (!booking) {
    throw new ConflictError("This time slot has just been booked");
  }

  return {
    booking,
    service,
    slot,
    employeeName: slot.employee.name,
    clientName,
  };
}
```

- [ ] **Step 2: Refactor `publicBookingService.createBooking` to use the shared core**

Replace the `createBooking` method in `publicBookingService.ts` with:

```ts
  async createBooking(slug: string, input: PublicBookingInput, now: Date) {
    const business = await businessRepository.findBySlug(slug);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const result = await createBookingForBusiness(business.id, input, now, "ONLINE");

    return buildBookingSummary({
      businessName: business.name,
      service: result.service,
      employeeName: result.employeeName,
      slot: result.slot,
      clientName: result.clientName,
    });
  },
```

Update the file's imports: remove `ConflictError` if no longer used elsewhere in the file (check — `getBusinessPage`/`listEmployeeSlots` don't throw `ConflictError`, only `createBooking` did, so it's now unused here and should be dropped), remove `bookingRepository`, `employeeRepository.hasServiceLink`-only-usage concerns (keep `employeeRepository` import if `listEmployeeSlots` still uses `employeeRepository.findById` — check the file, it does), remove `slotRunForDuration`/`isSlotUpcoming`/`normalizeClientName` if `listEmployeeSlots`/other methods still need `isSlotUpcoming` (it does, for `listEmployeeSlots`'s upcoming filter — keep that one), and add:

```ts
import { createBookingForBusiness } from "./bookingService";
```

Concretely, the new import block at the top of `publicBookingService.ts`:

```ts
import { NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";
import { businessRepository } from "../repositories/businessRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import { isSlotUpcoming, slotsFittingDuration } from "./bookingRules";
import { createBookingForBusiness } from "./bookingService";
import {
  buildBookingSummary,
  toPublicBusinessDto,
  toPublicSlotDto,
} from "./publicBookingRules";
```

(`normalizeClientName` and `slotRunForDuration` are no longer used directly in this file — they moved inside `createBookingForBusiness`. `ConflictError` is no longer used in this file either, since every throw in `createBooking` now happens inside `bookingService.ts`.)

Also delete the now-unused `PublicBookingInput` fields duplication check — `PublicBookingInput` interface stays as-is (still the shape the controller passes in), just confirm it structurally matches `CreateBookingInput` from `bookingService.ts` (same 5 fields) so `createBookingForBusiness(business.id, input, now, "ONLINE")` type-checks without adapting the object.

- [ ] **Step 3: Run typecheck**

```bash
cd server
npm run typecheck
```

Expected: green. If it complains about unused imports in `publicBookingService.ts`, remove them (the exact set depends on what `listEmployeeSlots`/`getBusinessPage` still use — keep only what's referenced).

- [ ] **Step 4: Run the full test suite**

```bash
cd server
npm test
```

Expected: all green (this refactor doesn't touch any tested pure function, so nothing here has direct test coverage — the safety net is typecheck + the unchanged `publicBookingRules.test.ts`/`bookingRules.test.ts` from Task 2).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/bookingService.ts server/src/services/publicBookingService.ts
git commit -m "refactor(server): extract shared booking-creation core into bookingService.ts"
```

---

### Task 4: `POST /bookings` — the internal booking endpoint

**Files:**
- Create: `server/src/services/internalBookingService.ts`
- Create: `server/src/controllers/bookingController.ts`
- Create: `server/src/routes/bookingRoutes.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Produces: `POST /bookings` — `authenticate, requireActiveSubscription, authorize(Role.ADMIN, Role.EMPLOYEE)`. Body: `{ availabilityId, serviceId, clientName, clientPhone, clientEmail? }` (no `employeeId` — the professional is whoever owns the chosen `availabilityId`; the shared core in `bookingService.ts` already enforces that slot belongs to the caller's business, so a separate `employeeId` field would be redundant and would let a client send a mismatched one).
- Consumes: `createBookingForBusiness` (Task 3), `requireBusinessId` (`lib/requireBusinessId.ts`).

- [ ] **Step 1: Create `internalBookingService.ts`**

```ts
import { createBookingForBusiness, CreateBookingInput } from "./bookingService";

export const internalBookingService = {
  createBooking(businessId: number, input: CreateBookingInput, now: Date) {
    return createBookingForBusiness(businessId, input, now, "INTERNAL").then((result) => ({
      id: result.booking.id,
      clientName: result.clientName,
      clientPhone: result.booking.clientPhone,
      clientEmail: result.booking.clientEmail,
      service: { id: result.service.id, name: result.service.name },
      employeeName: result.employeeName,
      date: result.slot.date.toISOString(),
      startTime: result.slot.startTime,
    }));
  },
};
```

- [ ] **Step 2: Create `bookingController.ts`**

```ts
import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import { CreateBookingInput } from "../services/bookingService";
import { internalBookingService } from "../services/internalBookingService";

export async function createBooking(
  request: FastifyRequest<{ Body: CreateBookingInput }>,
  reply: FastifyReply,
): Promise<void> {
  const booking = await internalBookingService.createBooking(
    requireBusinessId(request),
    request.body,
    new Date(),
  );
  reply.status(201).send({ booking });
}
```

- [ ] **Step 3: Create `bookingRoutes.ts`**

```ts
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { createBooking } from "../controllers/bookingController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";
import { CreateBookingInput } from "../services/bookingService";

const createBookingSchema = {
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

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateBookingInput }>(
    "/bookings",
    {
      schema: createBookingSchema,
      preHandler: [
        authenticate,
        requireActiveSubscription,
        authorize(Role.ADMIN, Role.EMPLOYEE),
      ],
    },
    createBooking,
  );
}
```

(Schema mirrors `publicRoutes.ts`'s `bookingSchema` exactly, since the client-facing validation rules are the same for both channels.)

- [ ] **Step 4: Register the route in `app.ts`**

In `server/src/app.ts`, add the import and registration next to the other authenticated routes:

```ts
import { bookingRoutes } from "./routes/bookingRoutes";
```

```ts
  app.register(availabilityRoutes);
  app.register(bookingRoutes);
  app.register(publicRoutes);
```

- [ ] **Step 5: Run typecheck**

```bash
cd server
npm run typecheck
```

Expected: green.

- [ ] **Step 6: Manual smoke test**

Start the server (`npm run dev`), then with a valid EMPLOYEE or ADMIN JWT (grab one from logging in through the web app, or from an existing dev script) and a real free `availabilityId`/`serviceId` for that business:

```bash
curl -X POST http://localhost:3333/bookings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"availabilityId": 1, "serviceId": 1, "clientName": "Teste", "clientPhone": "11999999999"}'
```

Expected: `201` with a `booking` object. Repeating the same request should now `409` ("This time slot has just been booked").

- [ ] **Step 7: Commit**

```bash
git add server/src/services/internalBookingService.ts server/src/controllers/bookingController.ts server/src/routes/bookingRoutes.ts server/src/app.ts
git commit -m "feat(server): add POST /bookings for staff-created reservations"
```

---

### Task 5: `GET /availabilities` — support viewing another employee's schedule

Today this route is EMPLOYEE-only and always shows the caller's own agenda. ADMIN has no agenda of its own — it needs to pick an employee to view. EMPLOYEE can also view (and, per Task 4, book on) a colleague's agenda.

**Files:**
- Modify: `server/src/services/availabilityService.ts`
- Modify: `server/src/controllers/availabilityController.ts`
- Modify: `server/src/routes/availabilityRoutes.ts`

**Interfaces:**
- Produces: `availabilityService.listAvailabilities(actor: JwtPayload, employeeIdParam: number | undefined, params, now)` — throws `BadRequestError` if `actor.role === "ADMIN"` and no `employeeIdParam`; throws `ForbiddenError` if the target employee isn't an `EMPLOYEE` in the same `businessId`.
- Consumes: `employeeRepository.findById` (already exists).

- [ ] **Step 1: Add `resolveTargetEmployeeId` and update `listAvailabilities` in `availabilityService.ts`**

Add these imports at the top of `availabilityService.ts`:

```ts
import { Role } from "@prisma/client";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { JwtPayload } from "../interfaces/auth";
import { employeeRepository } from "../repositories/employeeRepository";
import { availabilityRepository, ScheduleDirection } from "../repositories/availabilityRepository";
```

(`ForbiddenError`, `Role`, `JwtPayload`, `employeeRepository` are new; keep the rest of the existing imports from `./availabilityRules` unchanged.)

Add this function above the `availabilityService` object:

```ts
// ADMIN não tem agenda própria — precisa sempre dizer de quem quer ver.
// EMPLOYEE sem employeeId cai na própria; com employeeId, pode olhar (e,
// pela rota de reservas, agendar para) a agenda de um colega do mesmo
// negócio.
async function resolveTargetEmployeeId(
  actor: JwtPayload,
  employeeIdParam: number | undefined,
): Promise<number> {
  if (employeeIdParam === undefined) {
    if (actor.role !== Role.EMPLOYEE) {
      throw new BadRequestError("employeeId is required");
    }
    return actor.sub;
  }

  const employee = await employeeRepository.findById(employeeIdParam);
  if (
    !employee ||
    employee.role !== Role.EMPLOYEE ||
    employee.businessId !== actor.businessId
  ) {
    throw new ForbiddenError("You do not have permission to view this schedule");
  }

  return employeeIdParam;
}
```

Replace the `listAvailabilities` method's signature and first line:

```ts
  async listAvailabilities(
    actor: JwtPayload,
    employeeIdParam: number | undefined,
    params: { tab: ScheduleDirection; page: number },
    now: Date,
  ) {
    const employeeId = await resolveTargetEmployeeId(actor, employeeIdParam);
    const PAGE_SIZE = 7;
    const todayStart = businessToday(now);

    const totalDays = await availabilityRepository.countDates(
      employeeId,
      params.tab,
      todayStart,
    );
    const totalPages = totalPagesFor(totalDays, PAGE_SIZE);
    const page = clampPage(params.page, totalPages);

    const dateRows = await availabilityRepository.findDatesPage(
      employeeId,
      params.tab,
      todayStart,
      (page - 1) * PAGE_SIZE,
      PAGE_SIZE,
    );

    const availabilities = dateRows.length
      ? await availabilityRepository.findManyByEmployeeForDates(
          employeeId,
          dateRows.map((row) => row.date),
        )
      : [];

    return {
      availabilities: availabilities.map(toAvailabilityDto),
      page,
      totalPages,
    };
  },
```

(Body is otherwise identical to what it already does — only the first line, resolving `employeeId`, is new.)

- [ ] **Step 2: Update `availabilityController.ts`**

```ts
export interface ListAvailabilitiesQuery {
  tab?: "upcoming" | "past";
  page?: number;
  employeeId?: number;
}

export async function listAvailabilities(
  request: FastifyRequest<{ Querystring: ListAvailabilitiesQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const tab = request.query.tab === "past" ? "past" : "upcoming";
  const page = request.query.page ?? 1;

  const result = await availabilityService.listAvailabilities(
    request.user,
    request.query.employeeId,
    { tab, page },
    new Date(),
  );

  reply.send(result);
}
```

- [ ] **Step 3: Update `availabilityRoutes.ts`**

Add `employeeId` to the querystring schema and widen `authorize` for the `GET` route only:

```ts
const listAvailabilitiesSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      tab: { type: "string", enum: ["upcoming", "past"] },
      page: { type: "integer", minimum: 1 },
      employeeId: { type: "integer" },
    },
  },
};
```

```ts
  app.get<{ Querystring: ListAvailabilitiesQuery }>(
    "/availabilities",
    {
      schema: listAvailabilitiesSchema,
      preHandler: [authenticate, requireActiveSubscription, authorize(Role.ADMIN, Role.EMPLOYEE)],
    },
    listAvailabilities,
  );
```

(`generate`/`PUT`/`DELETE` stay `authorize(Role.EMPLOYEE)` — unchanged, those still only ever act on the caller's own `request.user.sub`.)

- [ ] **Step 4: Run typecheck**

```bash
cd server
npm run typecheck
```

Expected: green.

- [ ] **Step 5: Manual smoke test**

With an ADMIN token: `GET /availabilities` (no `employeeId`) should `400`. `GET /availabilities?employeeId=<valid EMPLOYEE in same business>` should `200`. `GET /availabilities?employeeId=<EMPLOYEE from a different business>` should `403`.

With an EMPLOYEE token: `GET /availabilities` (no `employeeId`) should `200` with their own schedule, same as before this task.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/availabilityService.ts server/src/controllers/availabilityController.ts server/src/routes/availabilityRoutes.ts
git commit -m "feat(server): let ADMIN and EMPLOYEE view a colleague's schedule"
```

---

### Task 6: Frontend types + dashboard KPI wording

**Files:**
- Modify: `web/lib/types.ts`
- Modify: `web/lib/schedule.test.ts`
- Modify: `web/lib/dashboard.ts`
- Modify: `web/lib/dashboard.test.ts`
- Modify: `web/components/dashboard/kpi-cards.tsx`

**Interfaces:**
- Produces: `Availability` type without `locked` (drop it — `isBooked` alone tells the whole story now that manual encaixe is gone).
- Produces: `DashboardKpis.bookings: { total: number; online: number; internal: number }`.

- [ ] **Step 1: Drop `locked` from `Availability` in `types.ts`**

```ts
export interface Availability {
  id: number;
  date: string; // ISO string vinda da API
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
}
```

- [ ] **Step 2: Fix `schedule.test.ts`'s fixtures**

Check `web/lib/schedule.test.ts` for any `locked: false` (or similar) fields in its `Availability` fixtures (per the earlier grep, line 21 has one) — remove that field from the fixture object literal, since the type no longer has it and TS will flag it as an excess property.

- [ ] **Step 3: Run the web test suite**

```bash
cd web
npm test
```

Expected: PASS (this file only builds fixtures and calls `groupByDate`/`orderDayGroups`/`summarizeDay`, none of which read `locked`, so removing the field is safe).

- [ ] **Step 4: Rename `manual` to `internal` in `dashboard.ts`**

```ts
export interface DashboardKpis {
  occupancy: { rate: number; booked: number; total: number };
  bookings: { total: number; online: number; internal: number };
  revenue: { scheduled: string; averageTicket: string };
  pace: { current: number; previous: number };
}
```

- [ ] **Step 5: Check `dashboard.test.ts` for `manual` references**

Search `web/lib/dashboard.test.ts` for `bookings.manual` or `manual:` in fixtures and rename to `internal` to match the new field. If no matches, skip.

- [ ] **Step 6: Update the KPI card hint text**

In `web/components/dashboard/kpi-cards.tsx`, change:

```tsx
      <Tile
        label="Reservas no período"
        value={String(kpis.bookings.total)}
        hint={`${kpis.bookings.online} pelo site · ${kpis.bookings.manual} encaixes`}
        icon={Calendar03Icon}
      />
```

to:

```tsx
      <Tile
        label="Reservas no período"
        value={String(kpis.bookings.total)}
        hint={`${kpis.bookings.online} pelo site · ${kpis.bookings.internal} por atendente`}
        icon={Calendar03Icon}
      />
```

- [ ] **Step 7: Run web typecheck + tests**

```bash
cd web
npm run typecheck
npm test
```

Expected: both green.

- [ ] **Step 8: Commit**

```bash
git add web/lib/types.ts web/lib/schedule.test.ts web/lib/dashboard.ts web/lib/dashboard.test.ts web/components/dashboard/kpi-cards.tsx
git commit -m "feat(web): drop locked from Availability, rename manual to internal in KPI"
```

---

### Task 7: Schedule page — employee picker + own-agenda gating + remove manual create

**Files:**
- Modify: `web/app/dashboard/schedule/page.tsx`

**Interfaces:**
- Consumes: `GET /employees` (existing, returns `{ employees: Employee[] }`, `Employee.services: EmployeeServiceLink[]`), `GET /availabilities?employeeId=&tab=&page=` (Task 5).

- [ ] **Step 1: Add employee-picker state and load `GET /employees` on mount**

At the top of the component, alongside the existing state, add:

```tsx
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    user.role === "EMPLOYEE" ? user.id : null,
  );
```

Add `Employee` to the existing `import { Availability } from "@/lib/types";` line — change it to:

```tsx
import { Availability, Employee } from "@/lib/types";
```

Add a `useEffect` that loads employees once and, for ADMIN, defaults the selection to the first one:

```tsx
  useEffect(() => {
    fetchAdapter<{ employees: Employee[] }>({ method: "GET", path: "/employees" })
      .then(({ data }) => {
        setEmployees(data.employees);
        setSelectedEmployeeId((current) => current ?? data.employees[0]?.id ?? null);
      })
      .catch(() => {
        // Lista de funcionários é só pro seletor — se falhar, a tela já
        // mostra o erro de carregar a agenda em seguida.
      });
  }, []);
```

- [ ] **Step 2: Wire `employeeId` into `loadAvailabilities` and guard against no selection**

Replace the `loadAvailabilities` callback's `path` and dependency list:

```tsx
  const loadAvailabilities = useCallback(() => {
    if (selectedEmployeeId === null) return Promise.resolve();

    return fetchAdapter<{
      availabilities: Availability[];
      page: number;
      totalPages: number;
    }>({
      method: "GET",
      path: `/availabilities?employeeId=${selectedEmployeeId}&tab=${tab}&page=${page}`,
    })
      .then(({ data }) => {
        setAvailabilities(data.availabilities);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setListError(null);
      })
      .catch((err) => {
        setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedEmployeeId, tab, page]);
```

- [ ] **Step 3: Remove the `user.role !== "EMPLOYEE"` early-return placeholder**

Delete this block entirely — ADMIN now sees the real screen, gated by the picker instead:

```tsx
  if (user.role !== "EMPLOYEE") {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <p className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">
          A agenda de horários é gerenciada por cada colaborador.
        </p>
      </div>
    );
  }
```

- [ ] **Step 4: Render the employee picker and compute `isOwnAgenda`**

Right before the `return (...)` at the end of the component, add:

```tsx
  const isOwnAgenda = selectedEmployeeId === user.id;
```

In the JSX header block, right after the title/subtitle `<div>` and before the action buttons `<div>`, add the picker (using the same `Select` primitives already imported elsewhere in this app — add the import):

```tsx
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

```tsx
        <Select
          value={selectedEmployeeId ? String(selectedEmployeeId) : ""}
          onValueChange={(value) => setSelectedEmployeeId(Number(value))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Escolha um colaborador" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={String(employee.id)}>
                  {employee.id === user.id ? "Eu" : employee.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
```

- [ ] **Step 5: Gate "Gerar horários" behind `isOwnAgenda`, remove "Novo horário" entirely**

Replace the action-buttons `<div>`:

```tsx
        <div className="flex shrink-0 gap-2">
          {isOwnAgenda && (
            <Button variant="outline" onClick={openGenerate}>
              <HugeiconsIcon icon={Calendar03Icon} data-icon="inline-start" />
              Gerar horários
            </Button>
          )}
        </div>
```

Remove the `Add01Icon` import (no longer used) and the whole "Novo horário" `<Dialog>` block (the one with `DialogTitle>{editing ? "Editar horário" : "Novo horário"}</DialogTitle>` and the `clientName` field) — see Task 8's Step 1 for what the edit-only dialog looks like afterward. Remove `openCreate`, the `clientName`/`setClientName` state, and drop `clientName` from `handleSubmit`'s `body` — it becomes:

```tsx
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const body = { date, startTime, endTime };

    try {
      await fetchAdapter({
        method: "PUT",
        path: `/availabilities/${editing?.id}`,
        body,
      });
      setDialogOpen(false);
      await loadAvailabilities();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }
```

(`editing` is now always set when this dialog opens — there's no more create path — so `openCreate`/the `!editing` branch inside `handleSubmit` go away too.)

- [ ] **Step 6: Hide edit/delete icons and remove the clientName field from the edit dialog, unless it's the own agenda**

In the slot row rendering, change the icon block:

```tsx
                              {slot.isBooked ? (
                                <Badge>Reservado</Badge>
                              ) : isOwnAgenda ? (
                                <div className="flex shrink-0 gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Editar horário"
                                    onClick={() => openEdit(slot)}
                                  >
                                    <HugeiconsIcon icon={PencilEdit02Icon} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Excluir horário"
                                    onClick={() => {
                                      setDeleteError(null);
                                      setDeleting(slot);
                                    }}
                                  >
                                    <HugeiconsIcon icon={Delete02Icon} />
                                  </Button>
                                </div>
                              ) : null}
```

(`slot.locked` is gone per Task 6 — use `slot.isBooked` directly, which is now equivalent.)

Drop the `clientName` field from the edit dialog (date/start/end only now):

```tsx
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar horário</DialogTitle>
            <DialogDescription>
              Defina o dia e o intervalo em que você está disponível.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="slot-date">Data</FieldLabel>
                <Input
                  id="slot-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="slot-start">Início</FieldLabel>
                  <Input
                    id="slot-start"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="slot-end">Fim</FieldLabel>
                  <Input
                    id="slot-end"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    required
                  />
                </Field>
              </div>
              {formError && <FieldError>{formError}</FieldError>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Salvando…
                    </>
                  ) : (
                    "Salvar"
                  )}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
```

And `openEdit` drops the `clientName` line:

```tsx
  function openEdit(availability: Availability) {
    setEditing(availability);
    setDate(availability.date.slice(0, 10));
    setStartTime(availability.startTime);
    setEndTime(availability.endTime);
    setFormError(null);
    setDialogOpen(true);
  }
```

- [ ] **Step 7: Typecheck**

```bash
cd web
npm run typecheck
```

Expected: green (Task 8 still needs to add the "Reservar" button in place of the `null` branch above, but the file should compile as a valid intermediate state — free slots just show nothing extra yet for non-own agendas).

- [ ] **Step 8: Manual check**

Run the dev server (`npm run dev` in `web/`, with the server running too) and log in as an EMPLOYEE: confirm the picker shows, defaults to "Eu", "Gerar horários" shows, "Novo horário" is gone, editing a free slot no longer has a client-name field, booked slots show "Reservado". Switch the picker to a colleague (if one exists) and confirm "Gerar horários" and the edit/delete icons disappear.

- [ ] **Step 9: Commit**

```bash
git add web/app/dashboard/schedule/page.tsx
git commit -m "feat(web): add employee picker to schedule, remove manual encaixe UI"
```

---

### Task 8: Schedule page — the "Reservar" dialog

**Files:**
- Modify: `web/app/dashboard/schedule/page.tsx`

**Interfaces:**
- Consumes: `POST /bookings` (Task 4), `Employee.services: EmployeeServiceLink[]` (already fetched in Task 7 via `GET /employees`).

- [ ] **Step 1: Add booking-dialog state**

```tsx
  const [bookingSlot, setBookingSlot] = useState<Availability | null>(null);
  const [bookingServiceId, setBookingServiceId] = useState("");
  const [bookingClientName, setBookingClientName] = useState("");
  const [bookingClientPhone, setBookingClientPhone] = useState("");
  const [bookingClientEmail, setBookingClientEmail] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
```

Add `Service` and `EmployeeServiceLink` aren't needed directly — the services list comes from the selected employee's `Employee.services` (already `EmployeeServiceLink[]`, which has `{ id, name }`).

- [ ] **Step 2: Compute the selected employee's service options**

Right after `const isOwnAgenda = ...`, add:

```tsx
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);
  const bookableServices = selectedEmployee?.services ?? [];
```

- [ ] **Step 3: Open/close/submit handlers**

```tsx
  function openBooking(slot: Availability) {
    setBookingSlot(slot);
    setBookingServiceId("");
    setBookingClientName("");
    setBookingClientPhone("");
    setBookingClientEmail("");
    setBookingError(null);
  }

  async function handleBookingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bookingSlot) return;

    setBookingError(null);
    setBookingSubmitting(true);

    try {
      await fetchAdapter({
        method: "POST",
        path: "/bookings",
        body: {
          availabilityId: bookingSlot.id,
          serviceId: Number(bookingServiceId),
          clientName: bookingClientName.trim(),
          clientPhone: bookingClientPhone.trim(),
          ...(bookingClientEmail.trim() ? { clientEmail: bookingClientEmail.trim() } : {}),
        },
      });
      setBookingSlot(null);
      await loadAvailabilities();
    } catch (err) {
      setBookingError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setBookingSubmitting(false);
    }
  }
```

- [ ] **Step 4: Render the "Reservar" button on free slots**

Replace the `null` branch from Task 7's Step 6 with the button (both own-agenda and viewing-a-colleague cases get it — the difference is only whether the edit/delete icons are alongside it):

```tsx
                              {slot.isBooked ? (
                                <Badge>Reservado</Badge>
                              ) : (
                                <div className="flex shrink-0 gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openBooking(slot)}
                                  >
                                    Reservar
                                  </Button>
                                  {isOwnAgenda && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="Editar horário"
                                        onClick={() => openEdit(slot)}
                                      >
                                        <HugeiconsIcon icon={PencilEdit02Icon} />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="Excluir horário"
                                        onClick={() => {
                                          setDeleteError(null);
                                          setDeleting(slot);
                                        }}
                                      >
                                        <HugeiconsIcon icon={Delete02Icon} />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              )}
```

- [ ] **Step 5: Render the "Reservar" dialog**

Add this `<Dialog>` alongside the others, near the end of the JSX (before the closing `</div>` of the component):

```tsx
      <Dialog open={bookingSlot !== null} onOpenChange={(open) => !open && setBookingSlot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reservar horário</DialogTitle>
            <DialogDescription>
              {bookingSlot &&
                `${formatDate(bookingSlot.date.slice(0, 10))} · ${bookingSlot.startTime}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBookingSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="booking-service">Serviço</FieldLabel>
                <Select value={bookingServiceId} onValueChange={setBookingServiceId}>
                  <SelectTrigger id="booking-service">
                    <SelectValue placeholder="Escolha o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {bookableServices.map((service) => (
                        <SelectItem key={service.id} value={String(service.id)}>
                          {service.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="booking-name">Nome do cliente</FieldLabel>
                <Input
                  id="booking-name"
                  value={bookingClientName}
                  onChange={(event) => setBookingClientName(event.target.value)}
                  maxLength={80}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="booking-phone">Telefone</FieldLabel>
                <Input
                  id="booking-phone"
                  value={bookingClientPhone}
                  onChange={(event) => setBookingClientPhone(event.target.value)}
                  maxLength={20}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="booking-email">Email (opcional)</FieldLabel>
                <Input
                  id="booking-email"
                  type="email"
                  value={bookingClientEmail}
                  onChange={(event) => setBookingClientEmail(event.target.value)}
                  maxLength={120}
                />
              </Field>
              {bookingError && <FieldError>{bookingError}</FieldError>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setBookingSlot(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={bookingSubmitting || !bookingServiceId}>
                  {bookingSubmitting ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Reservando…
                    </>
                  ) : (
                    "Reservar"
                  )}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Typecheck**

```bash
cd web
npm run typecheck
```

Expected: green.

- [ ] **Step 7: Manual end-to-end check**

With both servers running: as EMPLOYEE, click "Reservar" on a free slot, pick a service, fill client name/phone, submit — slot should flip to "Reservado" and the dialog close. Try reserving a slot that doesn't fit the chosen service's duration (e.g. a 60-minute service one slot before closing time) and confirm the 409 error surfaces in the dialog. As ADMIN, switch the picker to an employee, confirm only "Reservar" shows (no generate/edit/delete), and complete a reservation.

- [ ] **Step 8: Commit**

```bash
git add web/app/dashboard/schedule/page.tsx
git commit -m "feat(web): add Reservar dialog for staff-created bookings"
```

---

## Post-plan note (not a task — flag to the user, don't act on it)

While reading `server/prisma/migrations/`, the most recent migration is named `20260727073301_replace_asaas_with_stripe_billing`, and `schema.prisma` currently has `stripeCustomerId`/`stripeSubscriptionId` on `Business` — not the `asaasCustomerId`/`asaasSubscriptionId` fields the project memory (`project_mvp_roadmap.md`) describes as the current state of Fase 2.6. It looks like billing was switched back from Asaas to Stripe at some point after that memory was written. Worth updating that memory (and maybe asking Davi what happened) separately from this plan — it doesn't affect Fase 3 at all, but leaving it stale would mislead the next conversation.
