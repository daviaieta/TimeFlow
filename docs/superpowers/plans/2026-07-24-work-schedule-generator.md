# Gerador de carga horária + vitrine pública — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colaborador gera a agenda de um período inteiro (dias da semana, expediente, almoço, duração do slot) de uma vez; página pública vira vitrine com próximo horário vago por serviço e profissional.

**Architecture:** Um endpoint `POST /availabilities/generate` materializa `Availability` em massa via lógica pura (`availabilityGenerator.ts`: fatiar expediente, enumerar dias, pular sobreposições e passado) + `createMany` com o unique constraint como backstop. O catálogo público ganha `nextSlot` por profissional (uma query + função pura). Zero mudança de schema.

**Tech Stack:** Fastify 5, Prisma 6, Next.js App Router, shadcn/ui, `node --test`.

## Global Constraints

- Schemas de rota com `additionalProperties: false`; testes do servidor em `src/<pasta>/*.test.ts` (`npm test` em `server/`); testes do web via `node --test lib/*.test.ts` com extensão `.ts` nos imports.
- Erros do servidor em inglês; UI em português. TDD sempre: teste → falha → implementação → verde → commit.
- Reuso obrigatório: `isSlotUpcoming` (`publicBookingRules`), `toMinutes`/`formatMinutes` já existem no web (`lib/schedule.ts`) — no servidor, `availabilityGenerator` define os próprios `toMinutes`/`toTime` internos.
- Datas: day keys `"YYYY-MM-DD"`; `new Date(dayKey)` = meia-noite UTC (convenção de `buildAvailabilityData`); dia da semana via `getUTCDay()`.

---

### Task 1: Lógica pura do gerador

**Files:**
- Create: `server/src/services/availabilityGenerator.ts`
- Test: `server/src/services/availabilityGenerator.test.ts`

**Interfaces:**
- Consumes: `isSlotUpcoming` de `./publicBookingRules`
- Produces:
  - `interface WorkWindow { workStart: string; workEnd: string; breakStart?: string; breakEnd?: string }`
  - `sliceWorkday(window: WorkWindow, slotMinutes: number): { startTime: string; endTime: string }[]`
  - `enumerateDays(startDate: string, endDate: string, weekdays: number[]): string[]`
  - `interface PlannedSlot { date: string; startTime: string; endTime: string }`
  - `interface ExistingSlot { date: Date; startTime: string; endTime: string }`
  - `planAvailabilities(input: { startDate; endDate; weekdays; window: WorkWindow; slotMinutes; existing: ExistingSlot[]; now: Date }): { kept: PlannedSlot[]; skippedOverlap: number }`

- [ ] **Step 1: Teste que falha** — `availabilityGenerator.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enumerateDays,
  planAvailabilities,
  sliceWorkday,
} from "./availabilityGenerator";

test("fatia o expediente em slots inteiros", () => {
  assert.deepEqual(sliceWorkday({ workStart: "09:00", workEnd: "10:30" }, 30), [
    { startTime: "09:00", endTime: "09:30" },
    { startTime: "09:30", endTime: "10:00" },
    { startTime: "10:00", endTime: "10:30" },
  ]);
});

test("slot que não cabe no fim do expediente fica de fora", () => {
  const slots = sliceWorkday({ workStart: "09:00", workEnd: "10:20" }, 30);
  assert.equal(slots.length, 2);
  assert.equal(slots[1].endTime, "10:00");
});

test("almoço abre um buraco e retoma no fim da pausa", () => {
  const slots = sliceWorkday(
    { workStart: "11:00", workEnd: "14:00", breakStart: "12:00", breakEnd: "13:00" },
    45,
  );
  assert.deepEqual(slots, [
    { startTime: "11:00", endTime: "11:45" },
    { startTime: "13:00", endTime: "13:45" },
  ]);
});

test("expediente 09-18 com almoço 12-13 e 30min dá 16 slots", () => {
  const slots = sliceWorkday(
    { workStart: "09:00", workEnd: "18:00", breakStart: "12:00", breakEnd: "13:00" },
    30,
  );
  assert.equal(slots.length, 16);
});

test("enumera só os dias da semana pedidos", () => {
  // 2026-07-27 é segunda; 2026-08-02 é domingo
  const days = enumerateDays("2026-07-27", "2026-08-02", [1, 3, 5]);
  assert.deepEqual(days, ["2026-07-27", "2026-07-29", "2026-07-31"]);
});

test("plano pula slots que sobrepõem horário existente", () => {
  const { kept, skippedOverlap } = planAvailabilities({
    startDate: "2026-07-27",
    endDate: "2026-07-27",
    weekdays: [1],
    window: { workStart: "09:00", workEnd: "11:00" },
    slotMinutes: 30,
    existing: [
      { date: new Date("2026-07-27T00:00:00.000Z"), startTime: "09:15", endTime: "10:15" },
    ],
    now: new Date(2026, 6, 24, 8, 0),
  });

  // 09:00, 09:30 e 10:00 cruzam com 09:15–10:15; sobra 10:30
  assert.deepEqual(kept.map((s) => s.startTime), ["10:30"]);
  assert.equal(skippedOverlap, 3);
});

test("plano corta slots do passado no dia de hoje", () => {
  const { kept } = planAvailabilities({
    startDate: "2026-07-24",
    endDate: "2026-07-24",
    weekdays: [5], // sexta
    window: { workStart: "09:00", workEnd: "12:00" },
    slotMinutes: 60,
    existing: [],
    now: new Date(2026, 6, 24, 10, 30),
  });

  assert.deepEqual(kept.map((s) => s.startTime), ["11:00"]);
});
```

- [ ] **Step 2:** `cd server && npm test` → FAIL `Cannot find module './availabilityGenerator'`.
- [ ] **Step 3: Implementar**:

```ts
import { isSlotUpcoming } from "./publicBookingRules";

export interface WorkWindow {
  workStart: string;
  workEnd: string;
  breakStart?: string;
  breakEnd?: string;
}

export interface PlannedSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface ExistingSlot {
  date: Date;
  startTime: string;
  endTime: string;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTime(total: number): string {
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Um slot só entra se couber inteiro: antes do almoço, depois dele, e
// terminando dentro do expediente.
export function sliceWorkday(
  window: WorkWindow,
  slotMinutes: number,
): { startTime: string; endTime: string }[] {
  const workEnd = toMinutes(window.workEnd);
  const breakStart = window.breakStart ? toMinutes(window.breakStart) : null;
  const breakEnd = window.breakEnd ? toMinutes(window.breakEnd) : null;

  const slots: { startTime: string; endTime: string }[] = [];
  let cursor = toMinutes(window.workStart);

  while (cursor + slotMinutes <= workEnd) {
    const end = cursor + slotMinutes;

    if (breakStart !== null && breakEnd !== null && end > breakStart && cursor < breakEnd) {
      // cruzou o almoço — retoma no fim da pausa
      cursor = breakEnd;
      continue;
    }

    slots.push({ startTime: toTime(cursor), endTime: toTime(end) });
    cursor = end;
  }

  return slots;
}

// Dia da semana pela data UTC — datas de Availability são meia-noite UTC.
export function enumerateDays(
  startDate: string,
  endDate: string,
  weekdays: number[],
): string[] {
  const wanted = new Set(weekdays);
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    if (wanted.has(cursor.getUTCDay())) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function planAvailabilities(input: {
  startDate: string;
  endDate: string;
  weekdays: number[];
  window: WorkWindow;
  slotMinutes: number;
  existing: ExistingSlot[];
  now: Date;
}): { kept: PlannedSlot[]; skippedOverlap: number } {
  const daySlots = sliceWorkday(input.window, input.slotMinutes);
  const days = enumerateDays(input.startDate, input.endDate, input.weekdays);

  const existingByDay = new Map<string, ExistingSlot[]>();
  for (const slot of input.existing) {
    const key = slot.date.toISOString().slice(0, 10);
    const list = existingByDay.get(key) ?? [];
    list.push(slot);
    existingByDay.set(key, list);
  }

  const kept: PlannedSlot[] = [];
  let skippedOverlap = 0;

  for (const day of days) {
    const busy = existingByDay.get(day) ?? [];

    for (const slot of daySlots) {
      if (!isSlotUpcoming({ date: new Date(`${day}T00:00:00.000Z`), startTime: slot.startTime }, input.now)) {
        continue; // passado não conta nem como skipped — nunca deveria existir
      }

      const clash = busy.some((b) =>
        overlaps(
          toMinutes(slot.startTime),
          toMinutes(slot.endTime),
          toMinutes(b.startTime),
          toMinutes(b.endTime),
        ),
      );

      if (clash) {
        skippedOverlap += 1;
      } else {
        kept.push({ date: day, ...slot });
      }
    }
  }

  return { kept, skippedOverlap };
}
```

- [ ] **Step 4:** `npm test` → verdes (29 no servidor). **Step 5:** commit `feat(server): add pure work-schedule generator logic`.

---

### Task 2: Endpoint de geração

**Files:**
- Modify: `server/src/services/availabilityService.ts`
- Modify: `server/src/repositories/availabilityRepository.ts`
- Modify: `server/src/controllers/availabilityController.ts`
- Modify: `server/src/routes/availabilityRoutes.ts`

**Interfaces:**
- Consumes: `planAvailabilities`, `WorkWindow` (Task 1)
- Produces: `POST /availabilities/generate` → 201 `{ created: number, skipped: number }`

- [ ] **Step 1: Repository** — adicionar a `availabilityRepository`:

```ts
  findManyByEmployeeInRange(employeeId: number, from: Date, to: Date) {
    return prisma.availability.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
    });
  },

  createMany(employeeId: number, slots: { date: string; startTime: string; endTime: string }[]) {
    return prisma.availability.createMany({
      data: slots.map((slot) => ({
        employeeId,
        date: new Date(slot.date),
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
      skipDuplicates: true, // backstop: @@unique([employeeId, date, startTime])
    });
  },
```

- [ ] **Step 2: Service** — adicionar a `availabilityService`:

```ts
export interface GenerateInput {
  startDate: string;
  endDate: string;
  weekdays: number[];
  workStart: string;
  workEnd: string;
  breakStart?: string;
  breakEnd?: string;
  slotMinutes: number;
}

const MAX_RANGE_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;

// dentro do objeto availabilityService:
  async generateAvailabilities(employeeId: number, input: GenerateInput) {
    if (input.endDate < input.startDate) {
      throw new BadRequestError("endDate must be on or after startDate");
    }

    const from = new Date(`${input.startDate}T00:00:00.000Z`);
    const to = new Date(`${input.endDate}T00:00:00.000Z`);
    if ((to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      throw new BadRequestError(`Period cannot exceed ${MAX_RANGE_DAYS} days`);
    }

    if (input.workEnd <= input.workStart) {
      throw new BadRequestError("workEnd must be after workStart");
    }

    const hasBreakStart = input.breakStart !== undefined;
    const hasBreakEnd = input.breakEnd !== undefined;
    if (hasBreakStart !== hasBreakEnd) {
      throw new BadRequestError("breakStart and breakEnd must be provided together");
    }
    if (
      input.breakStart !== undefined &&
      input.breakEnd !== undefined &&
      !(
        input.workStart < input.breakStart &&
        input.breakStart < input.breakEnd &&
        input.breakEnd <= input.workEnd
      )
    ) {
      throw new BadRequestError("Break must fit inside working hours");
    }

    const existing = await availabilityRepository.findManyByEmployeeInRange(
      employeeId,
      from,
      to,
    );

    const { kept, skippedOverlap } = planAvailabilities({
      startDate: input.startDate,
      endDate: input.endDate,
      weekdays: input.weekdays,
      window: {
        workStart: input.workStart,
        workEnd: input.workEnd,
        breakStart: input.breakStart,
        breakEnd: input.breakEnd,
      },
      slotMinutes: input.slotMinutes,
      existing,
      now: new Date(),
    });

    const result = await availabilityRepository.createMany(employeeId, kept);

    return {
      created: result.count,
      skipped: skippedOverlap + (kept.length - result.count),
    };
  },
```

Imports novos no service: `planAvailabilities` de `./availabilityGenerator`.

- [ ] **Step 3: Controller** — adicionar:

```ts
export interface GenerateAvailabilitiesBody {
  startDate: string;
  endDate: string;
  weekdays: number[];
  workStart: string;
  workEnd: string;
  breakStart?: string;
  breakEnd?: string;
  slotMinutes: number;
}

export async function generateAvailabilities(
  request: FastifyRequest<{ Body: GenerateAvailabilitiesBody }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await availabilityService.generateAvailabilities(
    request.user.sub,
    request.body,
  );
  reply.status(201).send(result);
}
```

- [ ] **Step 4: Rota** — em `availabilityRoutes.ts`:

```ts
const timePattern = "^([01]\\d|2[0-3]):[0-5]\\d$";

const generateSchema = {
  body: {
    type: "object",
    required: ["startDate", "endDate", "weekdays", "workStart", "workEnd", "slotMinutes"],
    additionalProperties: false,
    properties: {
      startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      endDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      weekdays: {
        type: "array",
        items: { type: "integer", minimum: 0, maximum: 6 },
        minItems: 1,
        maxItems: 7,
        uniqueItems: true,
      },
      workStart: { type: "string", pattern: timePattern },
      workEnd: { type: "string", pattern: timePattern },
      breakStart: { type: "string", pattern: timePattern },
      breakEnd: { type: "string", pattern: timePattern },
      slotMinutes: { type: "integer", enum: [15, 30, 45, 60, 90] },
    },
  },
};

// registro:
  app.post<{ Body: GenerateAvailabilitiesBody }>(
    "/availabilities/generate",
    { schema: generateSchema, preHandler: [authenticate, authorize(Role.EMPLOYEE)] },
    generateAvailabilities,
  );
```

- [ ] **Step 5:** `npm test && npm run typecheck` → verdes/limpo.
- [ ] **Step 6: curl** (token EMPLOYEE em `$TOKEN`):

```bash
# gera seg-sex de duas semanas, 09-18h, almoço 12-13, 30min
curl -s -X POST http://localhost:3333/availabilities/generate \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"startDate":"2026-08-03","endDate":"2026-08-14","weekdays":[1,2,3,4,5],"workStart":"09:00","workEnd":"18:00","breakStart":"12:00","breakEnd":"13:00","slotMinutes":30}'
# Expected: {"created":160,"skipped":0}  (10 dias × 16 slots)

# repete → idempotente
# Expected: {"created":0,"skipped":160}

# almoço fora do expediente → 400
curl -s -X POST ... -d '{...,"breakStart":"08:00","breakEnd":"09:30",...}'
# Expected: 400 "Break must fit inside working hours"
```

- [ ] **Step 7:** commit `feat(server): add bulk availability generation endpoint`.

---

### Task 3: Catálogo público com próximo horário

**Files:**
- Modify: `server/src/services/publicBookingRules.ts`
- Modify: `server/src/services/publicBookingService.ts`
- Modify: `server/src/repositories/availabilityRepository.ts`
- Test: `server/src/services/publicBookingRules.test.ts` (novos casos + atualização de shape)

**Interfaces:**
- Consumes: `isSlotUpcoming`
- Produces:
  - `interface NextSlot { date: string; startTime: string }`
  - `firstUpcomingPerEmployee(slots: { employeeId: number; date: Date; startTime: string }[], now: Date): Map<number, NextSlot>`
  - `toPublicBusinessDto(business, services, nextSlots: Map<number, NextSlot>)` — `services[].employees[]` e novo array `professionals[]` ganham `nextSlot: NextSlot | null`

- [ ] **Step 1: Testes** — adicionar a `publicBookingRules.test.ts` e ajustar os existentes:

```ts
import { firstUpcomingPerEmployee } from "./publicBookingRules";

test("primeiro slot futuro por profissional", () => {
  const map = firstUpcomingPerEmployee(
    [
      { employeeId: 13, date: new Date("2026-07-23T00:00:00.000Z"), startTime: "09:00" },
      { employeeId: 13, date: new Date("2026-07-25T00:00:00.000Z"), startTime: "14:00" },
      { employeeId: 13, date: new Date("2026-07-26T00:00:00.000Z"), startTime: "09:00" },
      { employeeId: 14, date: new Date("2026-07-27T00:00:00.000Z"), startTime: "10:00" },
    ],
    now, // 2026-07-24 14:30
  );

  assert.deepEqual(map.get(13), { date: "2026-07-25T00:00:00.000Z", startTime: "14:00" });
  assert.deepEqual(map.get(14), { date: "2026-07-27T00:00:00.000Z", startTime: "10:00" });
});
```

No teste "catálogo público omite serviço sem profissional", passar um
`Map` como terceiro argumento e conferir o novo shape:

```ts
const nextSlots = new Map([[13, { date: "2026-07-25T00:00:00.000Z", startTime: "14:00" }]]);
const dto = toPublicBusinessDto({...}, [...], nextSlots);
assert.deepEqual(dto.services[0].employees, [
  { id: 13, name: "Derek", nextSlot: { date: "2026-07-25T00:00:00.000Z", startTime: "14:00" } },
]);
assert.deepEqual(dto.professionals, [
  { id: 13, name: "Derek", nextSlot: { date: "2026-07-25T00:00:00.000Z", startTime: "14:00" } },
]);
```

- [ ] **Step 2:** rodar → FAIL. **Step 3: Implementar** em `publicBookingRules.ts`:

```ts
export interface NextSlot {
  date: string;
  startTime: string;
}

// Slots chegam ordenados por data/hora — o primeiro futuro de cada
// profissional vence.
export function firstUpcomingPerEmployee(
  slots: { employeeId: number; date: Date; startTime: string }[],
  now: Date,
): Map<number, NextSlot> {
  const map = new Map<number, NextSlot>();

  for (const slot of slots) {
    if (map.has(slot.employeeId)) continue;
    if (!isSlotUpcoming(slot, now)) continue;
    map.set(slot.employeeId, {
      date: slot.date.toISOString(),
      startTime: slot.startTime,
    });
  }

  return map;
}
```

`toPublicBusinessDto` ganha o parâmetro `nextSlots: Map<number, NextSlot>`; cada
employee vira `{ id, name, nextSlot: nextSlots.get(id) ?? null }`; `professionals` é a
união (por id, ordem de primeira aparição) dos employees dos serviços visíveis.

Repository:

```ts
  findManyFreeByBusiness(businessId: number, from: Date) {
    return prisma.availability.findMany({
      where: { isBooked: false, date: { gte: from }, employee: { businessId } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: { employeeId: true, date: true, startTime: true },
    });
  },
```

`publicBookingService.getBusinessPage`: busca os slots livres
(`from` = meia-noite UTC de hoje), monta o map com `firstUpcomingPerEmployee(slots, new Date())`
e passa ao DTO.

- [ ] **Step 4:** `npm test && npm run typecheck` → verdes. **Step 5: curl**: catálogo mostra `nextSlot` nos employees e `professionals` no topo. **Step 6:** commit `feat(server): expose next free slot per professional in public catalog`.

---

### Task 4: Helpers puros do web

**Files:**
- Create: `web/lib/generatePlan.ts` — Test: `web/lib/generatePlan.test.ts`
- Modify: `web/lib/publicBooking.ts` — Test: `web/lib/publicBooking.test.ts`

**Interfaces:**
- Produces:
  - `estimateGeneratedSlots(input: { startDate; endDate; weekdays: number[]; workStart; workEnd; breakStart?; breakEnd?; slotMinutes }): number`
  - `nextSlotLabel(slot: { date: string; startTime: string }, todayKey: string): string`
  - tipos `PublicEmployee`/`PublicBusiness` ganham `nextSlot: { date: string; startTime: string } | null` e `professionals`

- [ ] **Step 1: Testes**:

`generatePlan.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateGeneratedSlots } from "./generatePlan.ts";

test("estimativa multiplica slots por dia pelos dias úteis do período", () => {
  const total = estimateGeneratedSlots({
    startDate: "2026-08-03",
    endDate: "2026-08-14",
    weekdays: [1, 2, 3, 4, 5],
    workStart: "09:00",
    workEnd: "18:00",
    breakStart: "12:00",
    breakEnd: "13:00",
    slotMinutes: 30,
  });
  assert.equal(total, 160); // 10 dias × 16 slots
});

test("estimativa sem almoço e sem dias casados", () => {
  const total = estimateGeneratedSlots({
    startDate: "2026-08-03",
    endDate: "2026-08-09",
    weekdays: [6], // só sábado (08/08)
    workStart: "08:00",
    workEnd: "12:00",
    slotMinutes: 60,
  });
  assert.equal(total, 4);
});

test("período invertido estima zero", () => {
  const total = estimateGeneratedSlots({
    startDate: "2026-08-10",
    endDate: "2026-08-03",
    weekdays: [1],
    workStart: "09:00",
    workEnd: "10:00",
    slotMinutes: 30,
  });
  assert.equal(total, 0);
});
```

`publicBooking.test.ts`, adicionar:

```ts
test("rótulo do próximo horário", () => {
  assert.equal(
    nextSlotLabel({ date: "2026-07-24T00:00:00.000Z", startTime: "14:00" }, "2026-07-24"),
    "Hoje 14:00",
  );
  assert.equal(
    nextSlotLabel({ date: "2026-07-27T00:00:00.000Z", startTime: "09:00" }, "2026-07-24"),
    "seg, 27 jul 09:00",
  );
});
```

- [ ] **Step 2:** rodar → FAIL. **Step 3: Implementar**:

`generatePlan.ts` — mesma mecânica do servidor (cursor em minutos pulando o almoço;
enumeração por `getUTCDay`), devolvendo apenas a contagem. É um espelho leve e
assumidamente duplicado: o servidor continua a fonte da verdade.

`publicBooking.ts`:

```ts
export interface NextSlot {
  date: string;
  startTime: string;
}

// PublicEmployee ganha nextSlot; PublicBusiness ganha professionals:
//   professionals: (PublicEmployee & { nextSlot: NextSlot | null })[]

export function nextSlotLabel(slot: NextSlot, todayKey: string): string {
  return `${dayChipLabel(slot.date.slice(0, 10), todayKey)} ${slot.startTime}`;
}
```

- [ ] **Step 4:** `npm test && npm run typecheck` → verdes. **Step 5:** commit `feat(web): add generator estimate and next-slot label helpers`.

---

### Task 5: Dialog de geração + vitrine pública

**Files:**
- Modify: `web/app/dashboard/schedule/page.tsx` (botão + dialog de geração)
- Modify: `web/app/[slug]/booking-wizard.tsx` (vitrine no passo 1)

**Interfaces:**
- Consumes: `POST /availabilities/generate` (Task 2), catálogo enriquecido (Task 3), `estimateGeneratedSlots`/`nextSlotLabel` (Task 4), `dayChipLabel`, `formatPrice`, `formatMinutes`, `localDayKey`

- [ ] **Step 1: Dialog de geração** na agenda — contrato de comportamento:

- Botão outline "Gerar horários" (ícone `Calendar03Icon`) ao lado de "Novo horário".
- Estado: `genOpen`, `genStart` (default hoje), `genEnd` (default +30d), `genDays: Set<number>` (default {1..5}), `genWorkStart` "09:00", `genWorkEnd` "18:00", `genBreak: boolean` (default true), `genBreakStart` "12:00", `genBreakEnd` "13:00", `genSlotMin` "30", `genError`, `genSubmitting`, `genResult`.
- Chips dos dias: 7 botões D S T Q Q S S togglando o Set (mesmo visual dos chips de dia do wizard).
- Rodapé do form: `≈ {estimateGeneratedSlots(...)} horários` recalculado a cada mudança (0 quando inválido).
- Submit → POST `/availabilities/generate` (body sem `breakStart/breakEnd` quando o toggle está off) → fecha? Não: mostra no próprio dialog "`{created}` criados · `{skipped}` pulados" com botão "Fechar"; ao fechar, `loadAvailabilities()`.
- Erro → mensagem da API inline.

- [ ] **Step 2: Vitrine** no `booking-wizard.tsx` — contrato:

- Tipos: usar `PublicBusiness` atualizado (professionals, nextSlot).
- **Só no passo `service`**, acima da lista: hero `rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-6` com monograma (quadrado translúcido), nome grande, tagline, e linha de stats `{services.length} serviços · {professionals.length} profissionais · {menor nextSlot é hoje ? "Hoje tem vaga" : `Próxima vaga ${dayChipLabel(...)}`}` (omitida se ninguém tem vaga).
- Cards de serviço ganham terceira linha: `com {employees.map(name).join(", ")}` e, quando houver, chip `Próximo: {nextSlotLabel(menor nextSlot do serviço, todayKey)}` em indigo suave.
- Abaixo dos serviços, seção "Profissionais": grid 2 colunas de cards com círculo-inicial, nome e `nextSlotLabel` (ou "sem vagas") — informativos, sem clique.
- Rodapé (todas as etapas): `<Link href="/">⚡ Time Flow</Link>` pequeno, `text-muted-foreground`, centralizado.
- Header compacto + progresso + dock permanecem como estão nos passos 2–4.

- [ ] **Step 3:** `npm run typecheck && npm test && npm run lint` → limpos (2 problemas pré-existentes seguem).
- [ ] **Step 4: Verificação real**: gerar horários pelo dialog (conferir contagem e agenda recarregada); `curl` do catálogo com `nextSlot`; abrir `/old-brothers-barbershop` e conferir hero, próximos horários e profissionais; reservar um slot gerado ponta a ponta.
- [ ] **Step 5:** commits `feat(web): add bulk schedule generator dialog` e `feat(web): turn public booking page into a business showcase`.

---

## Self-Review

**Cobertura do spec:** fatiamento/enumeração/sobreposição/passado → Task 1; endpoint com validações e idempotência → Task 2; `nextSlot` por profissional + `professionals` → Task 3; estimativa e rótulo → Task 4; dialog e vitrine → Task 5. Follow-ups (template persistente, exclusão em massa) fora, como no spec.

**Tipos:** `planAvailabilities` consumido na Task 2 com o mesmo shape produzido na Task 1; `NextSlot` idêntico no servidor (Task 3) e web (Task 4); `estimateGeneratedSlots` espelha o input do endpoint menos `weekdays` opcionais.

**Limite conhecido:** `createMany` não é transacional com a leitura do range (corrida entre dois generates simultâneos do mesmo colaborador) — o unique constraint + `skipDuplicates` garante não-duplicação; sobreposição em corrida extrema é aceita (mesmo dono, mesma tela).
