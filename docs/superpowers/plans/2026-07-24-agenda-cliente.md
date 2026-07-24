# Agenda do colaborador: encaixe manual e linha do tempo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o colaborador marque um cliente ao criar um horário e redesenhar a agenda como linha do tempo com informação real (cliente, duração, vazios do dia).

**Architecture:** Backend ganha `clientName` opcional em `Availability`; preenchê-lo marca `isBooked`. A trava de edição migra de `isBooked` para a existência de um `Booking` real, para o encaixe manual continuar editável pelo dono. Toda lógica pura (normalização, DTO, formatação de duração, nome do negócio) vive em módulos próprios com teste unitário; a camada Prisma é verificada end-to-end via curl.

**Tech Stack:** Fastify 5, Prisma 6, PostgreSQL, Next.js (App Router), React, Tailwind, shadcn/ui, `node --test`.

## Global Constraints

- Todo schema novo de rota usa `additionalProperties: false` (convenção do projeto).
- Testes do servidor rodam com `npm test` em `server/` (`node --import tsx --test src/**/*.test.ts`); o glob expande um nível, então arquivos de teste ficam em `src/<pasta>/*.test.ts`.
- Testes do front rodam com `node --test` puro — Node 25 faz type stripping nativo, **não adicionar tsx ao web**. Imports em arquivos de teste precisam da extensão `.ts` explícita.
- Mensagens de erro do servidor em inglês; textos de UI em português.
- TDD: escrever o teste, vê-lo falhar, implementar, vê-lo passar, commitar.

---

### Task 1: Coluna `clientName` no banco

**Files:**
- Modify: `server/prisma/schema.prisma:74-92`

**Interfaces:**
- Consumes: nada
- Produces: campo `Availability.clientName: string | null` disponível no Prisma Client

- [ ] **Step 1: Adicionar o campo ao schema**

Em `model Availability`, logo abaixo de `isBooked`:

```prisma
model Availability {
  id         Int      @id @default(autoincrement())
  date       DateTime
  startTime  String
  endTime    String
  isBooked   Boolean  @default(false)
  clientName String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  employee   User @relation(fields: [employeeId], references: [id])
  employeeId Int

  booking Booking?

  @@unique([employeeId, date, startTime])
}
```

- [ ] **Step 2: Gerar e aplicar a migration**

Run: `cd server && npx prisma migrate dev --name add_client_name_to_availability`
Expected: migration criada em `server/prisma/migrations/` e aplicada sem erro.

- [ ] **Step 3: Confirmar a coluna no banco**

Run:
```bash
cd server && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.availability.findFirst({ select: { id: true, clientName: true } })
  .then(r => console.log('OK', r)).finally(() => p.\$disconnect());
"
```
Expected: imprime `OK` com `clientName: null` (ou `OK null` se a tabela estiver vazia), sem erro de coluna inexistente.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): add optional clientName to Availability"
```

---

### Task 2: Regras puras de disponibilidade

**Files:**
- Create: `server/src/services/availabilityRules.ts`
- Test: `server/src/services/availabilityRules.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `normalizeClientName(value?: string | null): string | null`
  - `buildAvailabilityData(input: AvailabilityInput): AvailabilityData`
  - `toAvailabilityDto(row: AvailabilityRow): AvailabilityDto`
  - tipos `AvailabilityInput`, `AvailabilityData`, `AvailabilityRow`, `AvailabilityDto`

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/src/services/availabilityRules.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAvailabilityData,
  normalizeClientName,
  toAvailabilityDto,
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

test("cliente preenchido marca o horário como ocupado", () => {
  const data = buildAvailabilityData({
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "10:00",
    clientName: "Marcos",
  });

  assert.equal(data.clientName, "Marcos");
  assert.equal(data.isBooked, true);
});

test("sem cliente o horário fica livre", () => {
  const data = buildAvailabilityData({
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "10:00",
  });

  assert.equal(data.clientName, null);
  assert.equal(data.isBooked, false);
});

test("limpar o cliente libera o horário", () => {
  const data = buildAvailabilityData({
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "10:00",
    clientName: "   ",
  });

  assert.equal(data.clientName, null);
  assert.equal(data.isBooked, false);
});

test("dto marca locked quando existe booking real", () => {
  const dto = toAvailabilityDto({
    id: 1,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
    isBooked: true,
    clientName: "Marcos",
    booking: { id: 7 },
  });

  assert.equal(dto.locked, true);
  assert.equal(dto.date, "2026-07-25T00:00:00.000Z");
  assert.equal(dto.clientName, "Marcos");
});

test("encaixe manual não fica locked", () => {
  const dto = toAvailabilityDto({
    id: 2,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "11:00",
    endTime: "12:00",
    isBooked: true,
    clientName: "Rafael",
    booking: null,
  });

  assert.equal(dto.locked, false);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module './availabilityRules'`.

- [ ] **Step 3: Implementar o módulo**

Criar `server/src/services/availabilityRules.ts`:

```ts
export interface AvailabilityInput {
  date: string;
  startTime: string;
  endTime: string;
  clientName?: string | null;
}

export interface AvailabilityData {
  date: Date;
  startTime: string;
  endTime: string;
  clientName: string | null;
  isBooked: boolean;
}

export interface AvailabilityRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
  booking: { id: number } | null;
}

export interface AvailabilityDto {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
  locked: boolean;
}

export function normalizeClientName(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Um horário só é "ocupado" quando tem alguém associado — não existe slot
// marcado sem nome.
export function buildAvailabilityData(input: AvailabilityInput): AvailabilityData {
  const clientName = normalizeClientName(input.clientName);

  return {
    date: new Date(input.date),
    startTime: input.startTime,
    endTime: input.endTime,
    clientName,
    isBooked: clientName !== null,
  };
}

// locked = reserva feita por cliente externo. Encaixe manual (nome sem Booking)
// continua sob controle do colaborador.
export function toAvailabilityDto(row: AvailabilityRow): AvailabilityDto {
  return {
    id: row.id,
    date: row.date.toISOString(),
    startTime: row.startTime,
    endTime: row.endTime,
    isBooked: row.isBooked,
    clientName: row.clientName,
    locked: row.booking !== null,
  };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd server && npm test`
Expected: PASS — 7 testes novos verdes, além dos 7 já existentes (cors + errorHandler).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/availabilityRules.ts server/src/services/availabilityRules.test.ts
git commit -m "feat(server): add pure availability rules for manual client slots"
```

---

### Task 3: Ligar as regras ao service, repository e rota

**Files:**
- Modify: `server/src/repositories/availabilityRepository.ts`
- Modify: `server/src/services/availabilityService.ts`
- Modify: `server/src/routes/availabilityRoutes.ts:14-25`
- Modify: `server/src/controllers/availabilityController.ts`

**Interfaces:**
- Consumes: `buildAvailabilityData`, `toAvailabilityDto`, `AvailabilityInput` da Task 2
- Produces: `GET /availabilities` devolvendo `{ availabilities: AvailabilityDto[] }`; `POST`/`PUT` aceitando `clientName`

- [ ] **Step 1: Incluir o booking nas consultas do repository**

Substituir o conteúdo de `server/src/repositories/availabilityRepository.ts`:

```ts
import { prisma } from "../lib/prisma";
import { AvailabilityData } from "../services/availabilityRules";

// O booking é o que distingue reserva de cliente externo (intocável) de
// encaixe manual (editável pelo dono).
const withBooking = { booking: { select: { id: true } } };

export const availabilityRepository = {
  findManyByEmployee(employeeId: number) {
    return prisma.availability.findMany({
      where: { employeeId },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: withBooking,
    });
  },

  findById(id: number) {
    return prisma.availability.findUnique({
      where: { id },
      include: withBooking,
    });
  },

  findByUniqueSlot(employeeId: number, date: Date, startTime: string) {
    return prisma.availability.findUnique({
      where: { employeeId_date_startTime: { employeeId, date, startTime } },
    });
  },

  create(employeeId: number, data: AvailabilityData) {
    return prisma.availability.create({
      data: { ...data, employeeId },
      include: withBooking,
    });
  },

  update(id: number, data: AvailabilityData) {
    return prisma.availability.update({
      where: { id },
      data,
      include: withBooking,
    });
  },

  delete(id: number) {
    return prisma.availability.delete({ where: { id } });
  },
};
```

- [ ] **Step 2: Atualizar o service**

Substituir o conteúdo de `server/src/services/availabilityService.ts`:

```ts
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";
import {
  AvailabilityInput,
  AvailabilityRow,
  buildAvailabilityData,
  toAvailabilityDto,
} from "./availabilityRules";

function validateTimeRange(input: AvailabilityInput): void {
  // "HH:mm" com zero à esquerda compara corretamente como string
  if (input.endTime <= input.startTime) {
    throw new BadRequestError("endTime must be after startTime");
  }
}

async function findOwnedAvailability(
  employeeId: number,
  id: number,
): Promise<AvailabilityRow> {
  const availability = await availabilityRepository.findById(id);
  if (!availability || availability.employeeId !== employeeId) {
    throw new NotFoundError("Availability not found");
  }

  return availability;
}

// A trava é o Booking, não o isBooked: um encaixe digitado pelo próprio
// colaborador precisa continuar corrigível por ele.
function assertNotBooked(availability: AvailabilityRow, action: string): void {
  if (availability.booking) {
    throw new ConflictError(`This time slot is booked and cannot be ${action}`);
  }
}

export const availabilityService = {
  async listAvailabilities(employeeId: number) {
    const availabilities = await availabilityRepository.findManyByEmployee(employeeId);
    return availabilities.map(toAvailabilityDto);
  },

  async createAvailability(employeeId: number, input: AvailabilityInput) {
    validateTimeRange(input);

    const data = buildAvailabilityData(input);
    const duplicate = await availabilityRepository.findByUniqueSlot(
      employeeId,
      data.date,
      data.startTime,
    );
    if (duplicate) {
      throw new ConflictError("You already have a time slot starting at this time");
    }

    const created = await availabilityRepository.create(employeeId, data);
    return toAvailabilityDto(created);
  },

  async updateAvailability(employeeId: number, id: number, input: AvailabilityInput) {
    validateTimeRange(input);

    const availability = await findOwnedAvailability(employeeId, id);
    assertNotBooked(availability, "changed");

    const data = buildAvailabilityData(input);
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

  async deleteAvailability(employeeId: number, id: number) {
    const availability = await findOwnedAvailability(employeeId, id);
    assertNotBooked(availability, "deleted");

    await availabilityRepository.delete(id);
  },
};
```

- [ ] **Step 3: Aceitar `clientName` no schema da rota**

Em `server/src/routes/availabilityRoutes.ts`, dentro de `availabilityBodySchema.body.properties`, adicionar após `endTime`:

```ts
      clientName: { type: ["string", "null"], maxLength: 80 },
```

`null` é aceito de propósito: é como o PUT limpa um encaixe. O campo fica fora de `required`.

- [ ] **Step 4: Refletir o campo no tipo do controller**

Em `server/src/controllers/availabilityController.ts`, adicionar `clientName?: string | null;` à interface `AvailabilityBody`.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: todos os testes passam, `tsc --noEmit` sem saída.

- [ ] **Step 6: Verificar end-to-end no servidor real**

Com o servidor rodando e um token de colaborador (role EMPLOYEE) em `$TOKEN`:

```bash
# cria com cliente → isBooked true, locked false
curl -s -X POST http://localhost:3333/availabilities \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"date":"2026-08-10","startTime":"09:00","endTime":"10:00","clientName":"  Marcos  "}'

# lista → confere clientName normalizado e locked
curl -s http://localhost:3333/availabilities -H "Authorization: Bearer $TOKEN"

# limpa o cliente → isBooked volta a false
curl -s -X PUT http://localhost:3333/availabilities/<ID> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"date":"2026-08-10","startTime":"09:00","endTime":"10:00","clientName":null}'
```

Expected: POST devolve `clientName: "Marcos"`, `isBooked: true`, `locked: false`; o PUT devolve `clientName: null`, `isBooked: false`; nenhuma chamada retorna 409.

- [ ] **Step 7: Commit**

```bash
git add server/src
git commit -m "feat(server): accept clientName and gate edits by real bookings"
```

---

### Task 4: Formatação do nome do negócio

**Files:**
- Create: `web/lib/businessName.ts`
- Test: `web/lib/businessName.test.ts`
- Modify: `web/package.json` (scripts)
- Modify: `web/tsconfig.json` (compilerOptions)

**Interfaces:**
- Consumes: nada
- Produces: `formatBusinessName(name: string): string`, `businessInitials(name: string): string`

- [ ] **Step 1: Habilitar testes no web**

Em `web/package.json`, adicionar aos `scripts`:

```json
    "test": "node --test lib/*.test.ts",
    "typecheck": "tsc --noEmit"
```

Em `web/tsconfig.json`, adicionar em `compilerOptions`:

```json
    "allowImportingTsExtensions": true,
```

Necessário porque `node --test` exige a extensão `.ts` explícita no import, e o tsconfig usa `noEmit` com `moduleResolution: bundler` — a flag é segura nesse arranjo. Nenhuma dependência nova: Node 25 faz type stripping nativo.

- [ ] **Step 2: Escrever o teste que falha**

Criar `web/lib/businessName.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { businessInitials, formatBusinessName } from "./businessName.ts";

test("nome em formato slug vira title case", () => {
  assert.equal(formatBusinessName("old-brothers"), "Old Brothers");
  assert.equal(formatBusinessName("studio_e2e"), "Studio E2e");
});

test("nome já escrito por humano passa intacto", () => {
  assert.equal(formatBusinessName("Barbearia Teste"), "Barbearia Teste");
  assert.equal(formatBusinessName("Salao Outro"), "Salao Outro");
});

test("marca minúscula sem hífen não é alterada", () => {
  assert.equal(formatBusinessName("adidas"), "adidas");
});

test("espaços em volta são removidos", () => {
  assert.equal(formatBusinessName("  old-brothers  "), "Old Brothers");
});

test("string vazia não quebra", () => {
  assert.equal(formatBusinessName(""), "");
  assert.equal(businessInitials(""), "");
});

test("iniciais usam as duas primeiras palavras", () => {
  assert.equal(businessInitials("Old Brothers"), "OB");
  assert.equal(businessInitials("old-brothers"), "OB");
  assert.equal(businessInitials("Studio"), "S");
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd web && npm test`
Expected: FAIL — `Cannot find module './businessName.ts'`.

- [ ] **Step 4: Implementar o módulo**

Criar `web/lib/businessName.ts`:

```ts
// Só reformata quando o nome parece slug (tudo minúsculo com separador).
// Assim "old-brothers" vira "Old Brothers", mas uma marca propositalmente
// minúscula ou um nome já escrito por humano passa intacto.
const SLUG_LIKE = /^[a-z0-9]+([-_][a-z0-9]+)+$/;

export function formatBusinessName(name: string): string {
  const trimmed = name.trim();
  if (!SLUG_LIKE.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function businessInitials(name: string): string {
  return formatBusinessName(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd web && npm test && npm run typecheck`
Expected: 6 testes verdes, `tsc --noEmit` sem saída.

- [ ] **Step 6: Commit**

```bash
git add web/lib/businessName.ts web/lib/businessName.test.ts web/package.json web/tsconfig.json
git commit -m "feat(web): format slug-like business names for display"
```

---

### Task 5: Header do dashboard com identidade do negócio

**Files:**
- Modify: `web/app/dashboard/layout.tsx:134-142`

**Interfaces:**
- Consumes: `formatBusinessName`, `businessInitials` da Task 4
- Produces: nada

- [ ] **Step 1: Importar os helpers**

Em `web/app/dashboard/layout.tsx`, junto aos demais imports:

```tsx
import { businessInitials, formatBusinessName } from "@/lib/businessName";
```

- [ ] **Step 2: Substituir o bloco do header**

Trocar o `<header>` atual por:

```tsx
          <header className="flex h-16 items-center justify-between border-b bg-card px-6">
            {user.business ? (
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
                  {businessInitials(user.business.name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">
                    {formatBusinessName(user.business.name)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {roleLabels[user.role]}
                  </p>
                </div>
              </div>
            ) : (
              <p className="truncate text-sm font-medium">Plataforma</p>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <HugeiconsIcon icon={Logout03Icon} data-icon="inline-start" />
              Sair
            </Button>
          </header>
```

O superadmin não tem `business`, por isso o fallback "Plataforma" continua.

- [ ] **Step 3: Verificar no navegador**

Run: `cd web && npm run dev` (se ainda não estiver rodando) e abrir `http://localhost:3000/dashboard`
Expected: header mostra o quadrado com "OB", "Old Brothers" em negrito e o papel do usuário abaixo.

- [ ] **Step 4: Rodar lint e typecheck**

Run: `cd web && npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add web/app/dashboard/layout.tsx
git commit -m "feat(web): show business identity in dashboard header"
```

---

### Task 6: Helpers puros da agenda

**Files:**
- Create: `web/lib/schedule.ts`
- Test: `web/lib/schedule.test.ts`
- Modify: `web/lib/types.ts:22-28`

**Interfaces:**
- Consumes: tipo `Availability` de `web/lib/types.ts`
- Produces:
  - `toMinutes(time: string): number`
  - `formatMinutes(total: number): string`
  - `formatDuration(startTime: string, endTime: string): string`
  - `groupByDate(items: Availability[]): [string, Availability[]][]`
  - `partitionByDay(items: Availability[], todayKey: string): { upcoming: Availability[]; past: Availability[] }`
  - `summarizeDay(slots: Availability[]): { busy: number; free: number; label: string }`
  - `localDayKey(date: Date): string`

- [ ] **Step 1: Atualizar o tipo `Availability`**

Em `web/lib/types.ts`, substituir a interface:

```ts
export interface Availability {
  id: number;
  date: string; // ISO string vinda da API
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
  locked: boolean;
}
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `web/lib/schedule.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Availability } from "./types.ts";
import {
  formatDuration,
  formatMinutes,
  groupByDate,
  localDayKey,
  partitionByDay,
  summarizeDay,
  toMinutes,
} from "./schedule.ts";

function slot(overrides: Partial<Availability> & { id: number }): Availability {
  return {
    date: "2026-07-25T00:00:00.000Z",
    startTime: "09:00",
    endTime: "10:00",
    isBooked: false,
    clientName: null,
    locked: false,
    ...overrides,
  };
}

test("converte HH:mm em minutos", () => {
  assert.equal(toMinutes("09:00"), 540);
  assert.equal(toMinutes("00:30"), 30);
});

test("formata minutos em rótulo legível", () => {
  assert.equal(formatMinutes(60), "1h");
  assert.equal(formatMinutes(30), "30min");
  assert.equal(formatMinutes(90), "1h30");
  assert.equal(formatMinutes(180), "3h");
});

test("calcula duração de um horário", () => {
  assert.equal(formatDuration("09:00", "10:30"), "1h30");
});

test("agrupa por dia preservando a ordem", () => {
  const groups = groupByDate([
    slot({ id: 1, date: "2026-07-25T00:00:00.000Z" }),
    slot({ id: 2, date: "2026-07-26T00:00:00.000Z" }),
    slot({ id: 3, date: "2026-07-25T00:00:00.000Z", startTime: "11:00" }),
  ]);

  assert.deepEqual(
    groups.map(([day, slots]) => [day, slots.length]),
    [
      ["2026-07-25", 2],
      ["2026-07-26", 1],
    ],
  );
});

test("separa futuros de passados incluindo hoje nos futuros", () => {
  const { upcoming, past } = partitionByDay(
    [
      slot({ id: 1, date: "2026-07-24T00:00:00.000Z" }),
      slot({ id: 2, date: "2026-07-25T00:00:00.000Z" }),
      slot({ id: 3, date: "2026-07-26T00:00:00.000Z" }),
    ],
    "2026-07-25",
  );

  assert.deepEqual(upcoming.map((s) => s.id), [2, 3]);
  assert.deepEqual(past.map((s) => s.id), [1]);
});

test("resume ocupados, livres e total do dia", () => {
  const resumo = summarizeDay([
    slot({ id: 1, isBooked: true, clientName: "Marcos" }),
    slot({ id: 2, startTime: "10:00", endTime: "11:00" }),
    slot({ id: 3, startTime: "14:00", endTime: "15:30" }),
  ]);

  assert.equal(resumo.busy, 1);
  assert.equal(resumo.free, 2);
  assert.equal(resumo.label, "1 ocupado · 2 livres · 3h30");
});

test("resume no singular quando há um de cada", () => {
  const resumo = summarizeDay([
    slot({ id: 1, isBooked: true, clientName: "Marcos" }),
    slot({ id: 2, startTime: "10:00", endTime: "11:00" }),
  ]);

  assert.equal(resumo.label, "1 ocupado · 1 livre · 2h");
});

test("chave do dia usa data local, não UTC", () => {
  assert.equal(localDayKey(new Date(2026, 6, 25, 23, 30)), "2026-07-25");
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd web && npm test`
Expected: FAIL — `Cannot find module './schedule.ts'`.

- [ ] **Step 4: Implementar o módulo**

Criar `web/lib/schedule.ts`:

```ts
import type { Availability } from "./types";

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

export function formatDuration(startTime: string, endTime: string): string {
  return formatMinutes(toMinutes(endTime) - toMinutes(startTime));
}

export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function groupByDate(items: Availability[]): [string, Availability[]][] {
  const groups = new Map<string, Availability[]>();

  for (const item of items) {
    const key = item.date.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.entries()];
}

export function partitionByDay(
  items: Availability[],
  todayKey: string,
): { upcoming: Availability[]; past: Availability[] } {
  const upcoming: Availability[] = [];
  const past: Availability[] = [];

  for (const item of items) {
    if (item.date.slice(0, 10) >= todayKey) {
      upcoming.push(item);
    } else {
      past.push(item);
    }
  }

  return { upcoming, past };
}

export function summarizeDay(slots: Availability[]): {
  busy: number;
  free: number;
  label: string;
} {
  const busy = slots.filter((slot) => slot.isBooked).length;
  const free = slots.length - busy;
  const minutes = slots.reduce(
    (total, slot) => total + toMinutes(slot.endTime) - toMinutes(slot.startTime),
    0,
  );

  const label = [
    `${busy} ${busy === 1 ? "ocupado" : "ocupados"}`,
    `${free} ${free === 1 ? "livre" : "livres"}`,
    formatMinutes(minutes),
  ].join(" · ");

  return { busy, free, label };
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd web && npm test && npm run typecheck`
Expected: 8 testes novos verdes (14 no total com os da Task 4).

- [ ] **Step 6: Commit**

```bash
git add web/lib/schedule.ts web/lib/schedule.test.ts web/lib/types.ts
git commit -m "feat(web): add pure schedule helpers for the agenda timeline"
```

---

### Task 7: Agenda em linha do tempo com campo de cliente

**Files:**
- Modify: `web/app/dashboard/schedule/page.tsx` (reescrita da renderização e do formulário)

**Interfaces:**
- Consumes: `formatBusinessName` (Task 4); `formatDuration`, `formatMinutes`, `groupByDate`, `localDayKey`, `partitionByDay`, `summarizeDay`, `toMinutes` (Task 6); campo `clientName` da API (Task 3)
- Produces: nada

- [ ] **Step 1: Trocar imports e estado do formulário**

Substituir o import de `Availability` e adicionar os helpers:

```tsx
import { formatBusinessName } from "@/lib/businessName";
import {
  formatDuration,
  formatMinutes,
  groupByDate,
  localDayKey,
  partitionByDay,
  summarizeDay,
  toMinutes,
} from "@/lib/schedule";
```

Remover a função local `groupByDate` (linhas 37-46) — agora vem de `@/lib/schedule`.

Adicionar ao estado do componente:

```tsx
  const [clientName, setClientName] = useState("");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
```

Em `openCreate()` adicionar `setClientName("")`; em `openEdit(availability)` adicionar `setClientName(availability.clientName ?? "")`.

Em `handleSubmit`, trocar o corpo enviado:

```tsx
    const body = { date, startTime, endTime, clientName: clientName.trim() || null };
```

- [ ] **Step 2: Adicionar o campo Cliente ao dialog**

No `<FieldGroup>`, depois do grid de início/fim:

```tsx
              <Field>
                <FieldLabel htmlFor="slot-client">Cliente (opcional)</FieldLabel>
                <Input
                  id="slot-client"
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Nome de quem vai ocupar o horário"
                  maxLength={80}
                />
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para manter o horário livre para agendamento.
                </p>
              </Field>
```

- [ ] **Step 3: Trocar o cabeçalho da página**

Substituir o bloco de título por:

```tsx
        <div>
          {user.business && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {formatBusinessName(user.business.name)}
            </p>
          )}
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Agenda</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie seus horários disponíveis para agendamento.
          </p>
        </div>
```

- [ ] **Step 4: Renderizar as abas e a linha do tempo**

Substituir todo o bloco de listagem (o `<div className="mt-8 flex flex-col gap-6">` e seu conteúdo) por:

```tsx
      {!loading && !listError && past.length > 0 && (
        <div className="mt-6 inline-flex rounded-lg border bg-card p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setTab("upcoming")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === "upcoming"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Próximos
          </button>
          <button
            type="button"
            onClick={() => setTab("past")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === "past"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Passados
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border bg-card p-12">
            <Spinner />
          </div>
        ) : listError ? (
          <p className="rounded-2xl border bg-card p-12 text-center text-sm text-destructive">
            {listError}
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">
            {tab === "past"
              ? "Nenhum horário passado."
              : "Nenhum horário à frente. Crie seus horários livres para que clientes possam reservar."}
          </p>
        ) : (
          groupByDate(visible).map(([day, slots]) => {
            const resumo = summarizeDay(slots);
            const isToday = day === todayKey;

            return (
              <section
                key={day}
                className="overflow-hidden rounded-2xl border bg-card"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3.5">
                  <h2 className="text-sm font-semibold capitalize">
                    {isToday && <span className="text-indigo-600 dark:text-indigo-400">HOJE · </span>}
                    {formatDate(day)}
                  </h2>
                  <span className="text-xs text-muted-foreground">{resumo.label}</span>
                </div>

                <div className="px-5 py-4">
                  {slots.map((slot, index) => {
                    const previous = slots[index - 1];
                    const gap = previous
                      ? toMinutes(slot.startTime) - toMinutes(previous.endTime)
                      : 0;

                    return (
                      <div key={slot.id}>
                        {gap > 0 && (
                          <div className="grid grid-cols-[56px_1fr] gap-3">
                            <div className="pt-1 text-right text-[11px] text-muted-foreground/40">
                              ···
                            </div>
                            <div className="border-l-2 border-dotted py-2 pl-4 text-xs text-muted-foreground/60">
                              {formatMinutes(gap)} sem horários cadastrados
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-[56px_1fr] gap-3">
                          <div className="pt-2.5 text-right text-[11px] tabular-nums text-muted-foreground">
                            {slot.startTime}
                          </div>
                          <div className="relative border-l-2 pb-3 pl-4">
                            <span className="absolute -left-[5px] top-3 size-2 rounded-full bg-border" />
                            <div
                              className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 ${
                                slot.isBooked
                                  ? "border border-l-[3px] border-indigo-500/35 border-l-indigo-500 bg-indigo-500/10"
                                  : "border border-dashed"
                              }`}
                            >
                              <div className="min-w-0">
                                <p
                                  className={`truncate text-sm font-semibold ${
                                    slot.isBooked ? "" : "text-muted-foreground/60"
                                  }`}
                                >
                                  {slot.clientName ?? "Livre"}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {slot.startTime} – {slot.endTime} ·{" "}
                                  {formatDuration(slot.startTime, slot.endTime)}
                                </p>
                              </div>

                              {slot.locked ? (
                                <Badge>Reservado</Badge>
                              ) : (
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
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
```

- [ ] **Step 5: Derivar `todayKey`, `past` e `visible` antes do return**

Substituir a linha `const grouped = groupByDate(availabilities);` por:

```tsx
  const todayKey = localDayKey(new Date());
  const { upcoming, past } = partitionByDay(availabilities, todayKey);
  const visible = tab === "past" ? [...past].reverse() : upcoming;
```

Os passados aparecem do mais recente para o mais antigo — quem olha o histórico quer o dia que acabou de passar, não o de meses atrás.

- [ ] **Step 6: Rodar lint e typecheck**

Run: `cd web && npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 7: Verificar no navegador**

Abrir `http://localhost:3000/dashboard/schedule` logado como colaborador (role EMPLOYEE).
Expected:
- sobrelinha com o nome do negócio formatado acima de "Agenda";
- criar horário com cliente → bloco indigo com o nome, duração e ações disponíveis;
- criar horário sem cliente → bloco tracejado "Livre";
- dois horários não consecutivos no mesmo dia → linha `··· Xh sem horários cadastrados`;
- editar o horário com cliente e limpar o campo → volta a "Livre";
- aba "Passados" só aparece quando existem horários anteriores a hoje.

- [ ] **Step 8: Commit**

```bash
git add web/app/dashboard/schedule/page.tsx
git commit -m "feat(web): redesign agenda as timeline with client names"
```

---

## Self-Review

**Cobertura do spec:**

| Requisito do spec | Task |
|---|---|
| `clientName` opcional na Availability | 1, 2, 3 |
| `clientName` preenchido ⇒ `isBooked` | 2 (`buildAvailabilityData`), 3 |
| trim / vazio vira null | 2 |
| trava migra para `Booking` real | 3 (`assertNotBooked`) |
| DTO com `locked` | 2, 3 |
| schema da rota com `clientName` nullable | 3 |
| linha do tempo com trilho de horas | 7 |
| cabeçalho do dia com contadores | 6 (`summarizeDay`), 7 |
| vazios entre horários | 6 (`formatMinutes`), 7 |
| abas Próximos/Passados | 6 (`partitionByDay`), 7 |
| campo Cliente no dialog | 7 |
| `formatBusinessName` só para slug | 4 |
| nome no header + sobrelinha da agenda | 5, 7 |
| testes do servidor | 2 |
| testes do web via `node --test` | 4, 6 |

**Consistência de tipos:** `AvailabilityData` é produzida na Task 2 e consumida pelo repository na Task 3 com o mesmo nome e campos. `Availability` no front (Task 6) ganha `clientName` e `locked`, exatamente os campos que o DTO do servidor (Task 2) produz. `formatMinutes`/`formatDuration`/`toMinutes` são definidos na Task 6 e usados na Task 7 com as mesmas assinaturas.

**Desvio consciente do spec:** o spec previa adicionar `tsx` ao `web/` para rodar testes. Na verificação, o Node 25 do ambiente faz type stripping nativo — os testes rodam com `node --test` puro, sem dependência nova. O custo é exigir extensão `.ts` nos imports dos testes e a flag `allowImportingTsExtensions` no tsconfig.

**Cobertura de teste — limite conhecido:** as chamadas Prisma (repository) não têm teste automatizado, porque o projeto não tem banco de teste isolado e os testes rodariam contra o Postgres de desenvolvimento. A lógica de decisão foi extraída para módulos puros justamente para ser testável; a integração é verificada por curl no Step 6 da Task 3. Criar um banco de teste é candidato a follow-up.
