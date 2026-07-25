# Dashboard do dono do negócio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o placeholder de `/dashboard` por uma visão geral real do negócio para o ADMIN, alimentada por um endpoint agregado com janela de 7/30/90 dias olhando para frente.

**Architecture:** Um endpoint `GET /dashboard/overview?days=N` carrega as `Availability` da janela numa leitura enxuta e delega toda a agregação a funções puras em `dashboardRules.ts` (onde ficam os testes). O front consome o DTO inteiro numa chamada e distribui fatias por prop para componentes pequenos em `components/dashboard/`. Gráficos são SVG e CSS grid à mão — nenhuma dependência nova.

**Tech Stack:** Fastify 5 + Prisma 6 + TypeScript (server, testes com `node:test` via tsx) · Next 16 + React 19 + Tailwind 4 + shadcn/base-ui (web, testes com `node --test`).

**Spec:** `docs/superpowers/specs/2026-07-25-dashboard-dono-design.md`

## Global Constraints

- Toda lógica de agregação vive em funções **puras** em `dashboardRules.ts`. Repository só faz I/O; service só orquestra. Este é o padrão de `availabilityRules` / `availabilityService` e não deve ser quebrado.
- Todo schema Fastify novo usa `additionalProperties: false`.
- Rota do dashboard: `preHandler: [authenticate, authorize(Role.ADMIN)]`, `businessId` sempre via `requireBusinessId(request)`. Nenhum dado pode cruzar negócio.
- `Prisma.Decimal` serializa como string no JSON. Valores monetários viajam como **string** no DTO (`"120.00"`), igual a `Service.price` em `web/lib/types.ts`.
- Somas de dinheiro são feitas em **centavos inteiros**, nunca em float.
- `Availability.date` é meia-noite UTC. Dia da semana e dia do mês derivam de `getUTCDay()` / `getUTCDate()` — nunca dos getters locais.
- Comentários em português, explicando **por quê** e não o quê, como no resto do `server/src`.
- Divisão por zero: ocupação, ticket médio e `share` retornam `0` / `"0.00"`. Cada um tem teste.
- Não instalar nenhuma dependência nova.
- Rodar `npm run typecheck` antes de cada commit, nos dois pacotes tocados.

## File Structure

**Server** (`server/src/`)

| Arquivo | Responsabilidade |
|---|---|
| `services/dashboardRules.ts` | Tipos de entrada, tipos do DTO e todas as funções puras de agregação |
| `services/dashboardRules.test.ts` | `node:test` de todas as regras |
| `repositories/dashboardRepository.ts` | As três queries da feature |
| `services/dashboardService.ts` | Calcula a janela, chama o repo, compõe o DTO |
| `controllers/dashboardController.ts` | Extrai `businessId` e `days`, responde |
| `routes/dashboardRoutes.ts` | Rota + schema de querystring + auth |
| `server.ts` | Registro do plugin de rotas |

**Web** (`web/`)

| Arquivo | Responsabilidade |
|---|---|
| `lib/dashboard.ts` | Tipos do DTO + helpers puros de apresentação |
| `lib/dashboard.test.ts` | `node --test` dos helpers |
| `components/dashboard/period-selector.tsx` | Botões 7 / 30 / 90 |
| `components/dashboard/kpi-cards.tsx` | Os 4 tiles |
| `components/dashboard/occupancy-chart.tsx` | Barras empilhadas por dia/semana |
| `components/dashboard/occupancy-heatmap.tsx` | Grid dia-da-semana × hora |
| `components/dashboard/team-panel.tsx` | Ranking da equipe |
| `components/dashboard/services-panel.tsx` | Barras horizontais de serviços |
| `components/dashboard/upcoming-bookings.tsx` | Lista operacional |
| `components/dashboard/attention-panel.tsx` | Alertas |
| `components/dashboard/placeholder-overview.tsx` | O placeholder atual, extraído sem mudança visual |
| `components/dashboard/panel.tsx` | Casca visual compartilhada (título + ação + corpo) |
| `app/dashboard/page.tsx` | Gate por papel, fetch, estados, layout do grid |

---

## Task 1: Tipos e KPIs das regras puras

**Files:**
- Create: `server/src/services/dashboardRules.ts`
- Test: `server/src/services/dashboardRules.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `PriceLike`, `SlotRow`, `EmployeeRow`, `CatalogServiceRow`, `DashboardKpis`, `toCents(price: PriceLike): number`, `formatCents(cents: number): string`, `buildKpis(slots: SlotRow[], pace: { current: number; previous: number }): DashboardKpis`. Todas as tasks 2–5 importam `SlotRow` deste arquivo.

- [ ] **Step 1: Write the failing test**

Criar `server/src/services/dashboardRules.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { SlotRow, buildKpis, formatCents, toCents } from "./dashboardRules";

// Helper local: monta um slot com o mínimo e deixa o teste declarar só o que importa.
function slot(overrides: Partial<SlotRow> = {}): SlotRow {
  return {
    id: 1,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
    isBooked: false,
    clientName: null,
    employeeId: 1,
    booking: null,
    ...overrides,
  };
}

function booked(price: string, overrides: Partial<SlotRow> = {}): SlotRow {
  return slot({
    isBooked: true,
    booking: {
      clientName: "Cliente",
      clientPhone: "11999999999",
      service: { id: 1, name: "Corte", price },
    },
    ...overrides,
  });
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

test("encaixe manual conta como ocupado mas não como reserva do site", () => {
  const manual = slot({ id: 2, isBooked: true, clientName: "Encaixe" });
  const kpis = buildKpis([booked("50.00"), manual], { current: 0, previous: 0 });

  assert.equal(kpis.bookings.total, 2);
  assert.equal(kpis.bookings.online, 1);
  assert.equal(kpis.bookings.manual, 1);
});

test("receita soma só os slots com booking real", () => {
  const manual = slot({ id: 2, isBooked: true, clientName: "Encaixe" });
  const kpis = buildKpis(
    [booked("50.00"), booked("30.50", { id: 3 }), manual],
    { current: 0, previous: 0 },
  );

  assert.equal(kpis.revenue.scheduled, "80.50");
  assert.equal(kpis.revenue.averageTicket, "40.25");
});

test("ticket médio é zero quando só existem encaixes manuais", () => {
  const manual = slot({ isBooked: true, clientName: "Encaixe" });
  const kpis = buildKpis([manual], { current: 0, previous: 0 });

  assert.equal(kpis.revenue.scheduled, "0.00");
  assert.equal(kpis.revenue.averageTicket, "0.00");
});

test("ritmo repassa as contagens de reservas criadas", () => {
  const kpis = buildKpis([], { current: 12, previous: 8 });

  assert.equal(kpis.pace.current, 12);
  assert.equal(kpis.pace.previous, 8);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/services/dashboardRules.test.ts`
Expected: FAIL — `Cannot find module './dashboardRules'`.

- [ ] **Step 3: Write minimal implementation**

Criar `server/src/services/dashboardRules.ts`:

```ts
// price chega como Prisma Decimal em produção e como string nos testes —
// ambos respondem a toString(). Mesmo contrato de publicBookingRules.
export interface PriceLike {
  toString(): string;
}

// Uma Availability da janela, já com o booking (quando existe) resolvido.
// booking null + isBooked true = encaixe manual do colaborador.
export interface SlotRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
  employeeId: number;
  booking: {
    clientName: string;
    clientPhone: string;
    service: { id: number; name: string; price: PriceLike };
  } | null;
}

export interface EmployeeRow {
  id: number;
  name: string;
  pendingInvite: boolean;
  serviceIds: number[];
}

export interface CatalogServiceRow {
  id: number;
  name: string;
}

export interface DashboardKpis {
  occupancy: { rate: number; booked: number; total: number };
  bookings: { total: number; online: number; manual: number };
  revenue: { scheduled: string; averageTicket: string };
  pace: { current: number; previous: number };
}

// Dinheiro circula em centavos inteiros: somar Decimal como float acumula
// erro já na terceira reserva.
export function toCents(price: PriceLike): number {
  return Math.round(Number(price.toString()) * 100);
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function buildKpis(
  slots: SlotRow[],
  pace: { current: number; previous: number },
): DashboardKpis {
  const total = slots.length;
  const bookedSlots = slots.filter((slot) => slot.isBooked);
  const online = bookedSlots.filter((slot) => slot.booking !== null);

  const revenueCents = online.reduce(
    (sum, slot) => sum + toCents(slot.booking!.service.price),
    0,
  );

  return {
    occupancy: {
      rate: total === 0 ? 0 : bookedSlots.length / total,
      booked: bookedSlots.length,
      total,
    },
    bookings: {
      total: bookedSlots.length,
      online: online.length,
      manual: bookedSlots.length - online.length,
    },
    revenue: {
      scheduled: formatCents(revenueCents),
      averageTicket:
        online.length === 0
          ? "0.00"
          : formatCents(Math.round(revenueCents / online.length)),
    },
    pace,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/services/dashboardRules.test.ts && npm run typecheck`
Expected: todos os testes PASS, typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/dashboardRules.ts server/src/services/dashboardRules.test.ts
git commit -m "feat(server): add dashboard kpi rules"
```

---

## Task 2: Ocupação por período e mapa de calor

**Files:**
- Modify: `server/src/services/dashboardRules.ts`
- Test: `server/src/services/dashboardRules.test.ts`

**Interfaces:**
- Consumes: `SlotRow` (Task 1).
- Produces: `OccupancyBucket`, `HeatmapCell`, `bucketOccupancy(slots: SlotRow[], days: number, from: Date): OccupancyBucket[]`, `buildHeatmap(slots: SlotRow[]): HeatmapCell[]`.

Regra de agrupamento: `days === 7` gera um bucket por dia; 30 e 90 geram buckets semanais de 7 dias a partir de `from`. Buckets sem nenhum slot aparecem zerados — o eixo não pode ter buracos, senão a barra mente sobre a continuidade do tempo.

- [ ] **Step 1: Write the failing test**

Acrescentar ao final de `server/src/services/dashboardRules.test.ts` (o import do topo passa a incluir `bucketOccupancy` e `buildHeatmap`):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/services/dashboardRules.test.ts`
Expected: FAIL — `bucketOccupancy is not a function`.

- [ ] **Step 3: Write minimal implementation**

Acrescentar a `server/src/services/dashboardRules.ts`:

```ts
export interface OccupancyBucket {
  key: string;
  label: string;
  booked: number;
  free: number;
}

export interface HeatmapCell {
  weekday: number;
  hour: number;
  booked: number;
  total: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Rótulos fixos em vez de Intl: o teste não pode depender do ICU da máquina.
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function dayLabel(date: Date): string {
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()}`;
}

function weekLabel(start: Date, end: Date): string {
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
  }

  return (
    `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}` +
    `–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`
  );
}

// Buckets são montados a partir de `from`, não dos slots: um dia sem nenhum
// horário precisa aparecer zerado, senão o eixo some com o tempo parado.
export function bucketOccupancy(
  slots: SlotRow[],
  days: number,
  from: Date,
): OccupancyBucket[] {
  const daily = days === 7;
  const span = daily ? 1 : 7;
  const count = daily ? 7 : Math.ceil(days / 7);

  const buckets: OccupancyBucket[] = [];
  const index = new Map<string, OccupancyBucket>();

  for (let i = 0; i < count; i += 1) {
    const start = addDays(from, i * span);
    const end = addDays(start, span - 1);
    const bucket: OccupancyBucket = {
      key: dayKey(start),
      label: daily ? dayLabel(start) : weekLabel(start, end),
      booked: 0,
      free: 0,
    };

    buckets.push(bucket);

    for (let offset = 0; offset < span; offset += 1) {
      index.set(dayKey(addDays(start, offset)), bucket);
    }
  }

  for (const slot of slots) {
    const bucket = index.get(dayKey(slot.date));
    if (!bucket) continue; // slot fora da janela — defensivo

    if (slot.isBooked) bucket.booked += 1;
    else bucket.free += 1;
  }

  return buckets;
}

export function buildHeatmap(slots: SlotRow[]): HeatmapCell[] {
  const cells = new Map<string, HeatmapCell>();

  for (const slot of slots) {
    const weekday = slot.date.getUTCDay();
    const hour = Number(slot.startTime.slice(0, 2));
    const key = `${weekday}-${hour}`;

    const cell = cells.get(key) ?? { weekday, hour, booked: 0, total: 0 };
    cell.total += 1;
    if (slot.isBooked) cell.booked += 1;
    cells.set(key, cell);
  }

  return [...cells.values()].sort(
    (a, b) => a.weekday - b.weekday || a.hour - b.hour,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/services/dashboardRules.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/dashboardRules.ts server/src/services/dashboardRules.test.ts
git commit -m "feat(server): add occupancy buckets and heatmap rules"
```

---

## Task 3: Ranking de equipe e de serviços

**Files:**
- Modify: `server/src/services/dashboardRules.ts`
- Test: `server/src/services/dashboardRules.test.ts`

**Interfaces:**
- Consumes: `SlotRow`, `EmployeeRow`, `toCents`, `formatCents` (Task 1).
- Produces: `TeamRow`, `ServiceRankRow`, `rankTeam(slots: SlotRow[], employees: EmployeeRow[]): TeamRow[]`, `rankServices(slots: SlotRow[]): ServiceRankRow[]`.

`rankServices` não recebe a lista de serviços: nome e preço vêm do próprio `booking.service`, e serviço sem reserva na janela não aparece no painel de qualquer forma. (A spec previa um segundo parâmetro; ele é desnecessário.)

- [ ] **Step 1: Write the failing test**

Acrescentar `rankServices` e `rankTeam` ao import do topo de
`server/src/services/dashboardRules.test.ts`, e os testes ao final:

```ts
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
      clientName: "C", clientPhone: "1",
      service: { id: 1, name: "Corte", price: "30.00" },
    } });
  const barba = booked("70.00", { id: 9, booking: {
    clientName: "C", clientPhone: "1",
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

test("serviços com receita zero têm share zero, não NaN", () => {
  const rows = rankServices([
    booked("0.00", { booking: {
      clientName: "C", clientPhone: "1",
      service: { id: 1, name: "Cortesia", price: "0.00" },
    } }),
  ]);

  assert.equal(rows[0].share, 0);
  assert.equal(rows[0].revenue, "0.00");
});

test("encaixe manual não entra no ranking de serviços", () => {
  assert.deepEqual(rankServices([slot({ isBooked: true, clientName: "Encaixe" })]), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/services/dashboardRules.test.ts`
Expected: FAIL — `rankTeam is not a function`.

- [ ] **Step 3: Write minimal implementation**

Acrescentar a `server/src/services/dashboardRules.ts`:

```ts
export interface TeamRow {
  id: number;
  name: string;
  pendingInvite: boolean;
  slots: number;
  booked: number;
  rate: number;
  revenue: string;
}

export interface ServiceRankRow {
  id: number;
  name: string;
  bookings: number;
  revenue: string;
  share: number;
}

// Colaborador sem nenhum horário na janela cai para o fim: ocupação 0 de 0
// não é desempenho ruim, é agenda fechada — outra conversa com o dono.
export function rankTeam(slots: SlotRow[], employees: EmployeeRow[]): TeamRow[] {
  const rows = employees.map<TeamRow>((employee) => {
    const own = slots.filter((slot) => slot.employeeId === employee.id);
    const booked = own.filter((slot) => slot.isBooked);
    const revenueCents = booked.reduce(
      (sum, slot) => sum + (slot.booking ? toCents(slot.booking.service.price) : 0),
      0,
    );

    return {
      id: employee.id,
      name: employee.name,
      pendingInvite: employee.pendingInvite,
      slots: own.length,
      booked: booked.length,
      rate: own.length === 0 ? 0 : booked.length / own.length,
      revenue: formatCents(revenueCents),
    };
  });

  return rows.sort((a, b) => {
    const aEmpty = a.slots === 0 ? 1 : 0;
    const bEmpty = b.slots === 0 ? 1 : 0;

    return (
      aEmpty - bEmpty ||
      b.rate - a.rate ||
      b.booked - a.booked ||
      a.name.localeCompare(b.name, "pt-BR")
    );
  });
}

export function rankServices(slots: SlotRow[]): ServiceRankRow[] {
  const totals = new Map<number, { name: string; bookings: number; cents: number }>();

  for (const slot of slots) {
    if (!slot.booking) continue;

    const { id, name, price } = slot.booking.service;
    const entry = totals.get(id) ?? { name, bookings: 0, cents: 0 };
    entry.bookings += 1;
    entry.cents += toCents(price);
    totals.set(id, entry);
  }

  const totalCents = [...totals.values()].reduce((sum, e) => sum + e.cents, 0);

  return [...totals.entries()]
    .map<ServiceRankRow>(([id, entry]) => ({
      id,
      name: entry.name,
      bookings: entry.bookings,
      revenue: formatCents(entry.cents),
      share: totalCents === 0 ? 0 : entry.cents / totalCents,
    }))
    .sort(
      (a, b) =>
        b.share - a.share ||
        b.bookings - a.bookings ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/services/dashboardRules.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/dashboardRules.ts server/src/services/dashboardRules.test.ts
git commit -m "feat(server): add team and service ranking rules"
```

---

## Task 4: Próximas reservas e alertas

**Files:**
- Modify: `server/src/services/dashboardRules.ts`
- Test: `server/src/services/dashboardRules.test.ts`

**Interfaces:**
- Consumes: `SlotRow`, `EmployeeRow`, `CatalogServiceRow` (Task 1); `isSlotUpcoming` de `./publicBookingRules` (já existe).
- Produces: `UpcomingSlotRow`, `UpcomingRow`, `AlertKind`, `DashboardAlert`, `buildUpcoming(rows: UpcomingSlotRow[], now: Date, limit: number): UpcomingRow[]`, `buildAlerts(slots: SlotRow[], employees: EmployeeRow[], services: CatalogServiceRow[], days: number): DashboardAlert[]`.

`buildUpcoming` recebe o resultado da query dedicada de próximos reservados — **não** os slots da janela, porque a lista operacional ignora o seletor de período.

- [ ] **Step 1: Write the failing test**

Acrescentar `buildUpcoming`, `buildAlerts` e o tipo `UpcomingSlotRow` ao import do topo
de `server/src/services/dashboardRules.test.ts`, e os testes ao final:

```ts
function upcomingRow(overrides: Partial<UpcomingSlotRow> = {}): UpcomingSlotRow {
  return {
    id: 1,
    date: new Date("2026-07-25T00:00:00.000Z"),
    startTime: "14:00",
    endTime: "15:00",
    clientName: null,
    employee: { name: "Ana" },
    booking: {
      clientName: "Marcos",
      clientPhone: "11988887777",
      service: { name: "Corte" },
    },
    ...overrides,
  };
}

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

test("encaixe manual entra sem serviço nem telefone", () => {
  const rows = buildUpcoming(
    [upcomingRow({ clientName: "Encaixe do Zé", booking: null })],
    new Date("2026-07-25T10:00:00"),
    8,
  );

  assert.equal(rows[0].clientName, "Encaixe do Zé");
  assert.equal(rows[0].clientPhone, null);
  assert.equal(rows[0].serviceName, null);
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

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/services/dashboardRules.test.ts`
Expected: FAIL — `buildUpcoming is not a function`.

- [ ] **Step 3: Write minimal implementation**

Acrescentar a `server/src/services/dashboardRules.ts` (o import de `isSlotUpcoming` vai para o topo do arquivo):

```ts
import { isSlotUpcoming } from "./publicBookingRules";
```

```ts
// Linha da query dedicada de próximos reservados. Formato diferente de
// SlotRow porque aqui interessa o nome do profissional, não o id.
export interface UpcomingSlotRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  clientName: string | null;
  employee: { name: string };
  booking: {
    clientName: string;
    clientPhone: string;
    service: { name: string };
  } | null;
}

export interface UpcomingRow {
  availabilityId: number;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientPhone: string | null;
  serviceName: string | null;
  employeeName: string;
}

export type AlertKind =
  | "employee-no-slots"
  | "service-no-employee"
  | "day-fully-booked"
  | "pending-invite";

export interface DashboardAlert {
  kind: AlertKind;
  label: string;
  count: number;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function buildUpcoming(
  rows: UpcomingSlotRow[],
  now: Date,
  limit: number,
): UpcomingRow[] {
  return rows
    .filter((row) => isSlotUpcoming(row, now))
    .sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        a.startTime.localeCompare(b.startTime),
    )
    .slice(0, limit)
    .map((row) => ({
      availabilityId: row.id,
      date: row.date.toISOString().slice(0, 10),
      startTime: row.startTime,
      endTime: row.endTime,
      // Booking manda no nome: é o cliente que de fato reservou.
      clientName: row.booking?.clientName ?? row.clientName ?? "Cliente",
      clientPhone: row.booking?.clientPhone ?? null,
      serviceName: row.booking?.service.name ?? null,
      employeeName: row.employee.name,
    }));
}

// Alertas são texto pronto: quem monta a frase é quem conhece a regra, não a UI.
export function buildAlerts(
  slots: SlotRow[],
  employees: EmployeeRow[],
  services: CatalogServiceRow[],
  days: number,
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  const withSlots = new Set(slots.map((slot) => slot.employeeId));
  const idle = employees.filter(
    // Convite pendente já tem alerta próprio — não cobrar agenda de quem
    // ainda nem entrou.
    (employee) => !employee.pendingInvite && !withSlots.has(employee.id),
  ).length;

  if (idle > 0) {
    alerts.push({
      kind: "employee-no-slots",
      count: idle,
      label:
        `${idle} ${plural(idle, "colaborador", "colaboradores")} sem horários ` +
        `abertos nos próximos ${days} dias`,
    });
  }

  const linked = new Set(employees.flatMap((employee) => employee.serviceIds));
  const orphan = services.filter((service) => !linked.has(service.id)).length;

  if (orphan > 0) {
    alerts.push({
      kind: "service-no-employee",
      count: orphan,
      label: `${orphan} ${plural(orphan, "serviço", "serviços")} sem profissional vinculado`,
    });
  }

  const perDay = new Map<string, { total: number; free: number }>();
  for (const slot of slots) {
    const key = slot.date.toISOString().slice(0, 10);
    const entry = perDay.get(key) ?? { total: 0, free: 0 };
    entry.total += 1;
    if (!slot.isBooked) entry.free += 1;
    perDay.set(key, entry);
  }

  const fullDays = [...perDay.values()].filter(
    (entry) => entry.total > 0 && entry.free === 0,
  ).length;

  if (fullDays > 0) {
    alerts.push({
      kind: "day-fully-booked",
      count: fullDays,
      label: `${fullDays} ${plural(fullDays, "dia", "dias")} sem nenhum horário livre`,
    });
  }

  const pending = employees.filter((employee) => employee.pendingInvite).length;
  if (pending > 0) {
    alerts.push({
      kind: "pending-invite",
      count: pending,
      label: `${pending} ${plural(pending, "convite pendente", "convites pendentes")}`,
    });
  }

  return alerts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/services/dashboardRules.test.ts && npm run typecheck`
Expected: PASS (toda a suíte de `dashboardRules`, ~25 testes).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/dashboardRules.ts server/src/services/dashboardRules.test.ts
git commit -m "feat(server): add upcoming bookings and alert rules"
```

---

## Task 5: Endpoint `GET /dashboard/overview`

**Files:**
- Create: `server/src/repositories/dashboardRepository.ts`
- Create: `server/src/services/dashboardService.ts`
- Create: `server/src/controllers/dashboardController.ts`
- Create: `server/src/routes/dashboardRoutes.ts`
- Modify: `server/src/server.ts`

**Interfaces:**
- Consumes: tudo de `dashboardRules` (Tasks 1–4); `employeeRepository.findManyByBusiness`, `serviceRepository.findManyByBusiness`, `requireBusinessId`, `authenticate`, `authorize`.
- Produces: `DashboardOverview` (tipo do DTO, exportado de `dashboardService`) e a rota `GET /dashboard/overview?days=7|30|90`. A Task 6 espelha esse DTO em `web/lib/dashboard.ts`.

Esta task não tem teste automatizado: é I/O e fiação. A verificação é manual com `curl` no Step 5.

- [ ] **Step 1: Criar o repository**

Criar `server/src/repositories/dashboardRepository.ts`:

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
  clientName: true,
  employeeId: true,
  booking: {
    select: {
      clientName: true,
      clientPhone: true,
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
        clientName: true,
        employee: { select: { name: true } },
        booking: {
          select: {
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

- [ ] **Step 2: Criar o service**

Criar `server/src/services/dashboardService.ts`:

```ts
import { dashboardRepository } from "../repositories/dashboardRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import {
  DashboardAlert,
  DashboardKpis,
  EmployeeRow,
  HeatmapCell,
  OccupancyBucket,
  ServiceRankRow,
  TeamRow,
  UpcomingRow,
  buildAlerts,
  buildHeatmap,
  buildKpis,
  buildUpcoming,
  bucketOccupancy,
  rankServices,
  rankTeam,
} from "./dashboardRules";

export interface DashboardOverview {
  range: { days: number; from: string; to: string };
  kpis: DashboardKpis;
  occupancyByBucket: OccupancyBucket[];
  heatmap: HeatmapCell[];
  team: TeamRow[];
  services: ServiceRankRow[];
  upcoming: UpcomingRow[];
  alerts: DashboardAlert[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_LIMIT = 8;
// Margem no take: slots de hoje já passados são descartados depois da query,
// então buscar exatamente o limite deixaria a lista curta no fim do dia.
const UPCOMING_FETCH = UPCOMING_LIMIT * 4;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const dashboardService = {
  async getOverview(
    businessId: number,
    days: number,
    now: Date,
  ): Promise<DashboardOverview> {
    // Mesma convenção de publicBookingService: a janela começa na meia-noite
    // UTC do dia de hoje, que é como Availability.date está gravado.
    const from = new Date(`${dayKey(now)}T00:00:00.000Z`);
    const to = new Date(from.getTime() + days * DAY_MS);

    // Ritmo compara dois períodos igualmente fechados no passado — comparar a
    // agenda futura com o passado seria estruturalmente negativo.
    const paceFrom = new Date(from.getTime() - days * DAY_MS);
    const pacePreviousFrom = new Date(from.getTime() - 2 * days * DAY_MS);

    const [slots, upcomingRows, paceCurrent, pacePrevious, employees, services] =
      await Promise.all([
        dashboardRepository.findSlotsInRange(businessId, from, to),
        dashboardRepository.findUpcomingBooked(businessId, from, UPCOMING_FETCH),
        dashboardRepository.countBookingsCreatedBetween(businessId, paceFrom, from),
        dashboardRepository.countBookingsCreatedBetween(
          businessId,
          pacePreviousFrom,
          paceFrom,
        ),
        employeeRepository.findManyByBusiness(businessId),
        serviceRepository.findManyByBusiness(businessId),
      ]);

    const employeeRows: EmployeeRow[] = employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      pendingInvite: employee.password === null,
      serviceIds: employee.services.map((link) => link.service.id),
    }));

    const catalog = services.map((service) => ({
      id: service.id,
      name: service.name,
    }));

    return {
      range: { days, from: dayKey(from), to: dayKey(to) },
      kpis: buildKpis(slots, { current: paceCurrent, previous: pacePrevious }),
      occupancyByBucket: bucketOccupancy(slots, days, from),
      heatmap: buildHeatmap(slots),
      team: rankTeam(slots, employeeRows),
      services: rankServices(slots),
      upcoming: buildUpcoming(upcomingRows, now, UPCOMING_LIMIT),
      alerts: buildAlerts(slots, employeeRows, catalog, days),
    };
  },
};
```

- [ ] **Step 3: Criar controller e rota**

Criar `server/src/controllers/dashboardController.ts`:

```ts
import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import { dashboardService } from "../services/dashboardService";

export interface OverviewQuery {
  days: number;
}

export async function getOverview(
  request: FastifyRequest<{ Querystring: OverviewQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const businessId = requireBusinessId(request);
  const overview = await dashboardService.getOverview(
    businessId,
    request.query.days,
    new Date(),
  );

  reply.send(overview);
}
```

Criar `server/src/routes/dashboardRoutes.ts`:

```ts
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { getOverview, OverviewQuery } from "../controllers/dashboardController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const overviewSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      // coerceTypes global do Fastify converte "30" em 30 antes do enum.
      days: { type: "integer", enum: [7, 30, 90], default: 7 },
    },
  },
};

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: OverviewQuery }>(
    "/dashboard/overview",
    {
      schema: overviewSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    getOverview,
  );
}
```

Em `server/src/server.ts`, adicionar o import junto dos outros (ordem alfabética, depois de `businessRoutes`):

```ts
import { dashboardRoutes } from "./routes/dashboardRoutes";
```

e o registro após `app.register(businessRoutes);`:

```ts
app.register(dashboardRoutes);
```

- [ ] **Step 4: Verificar tipos e subir o servidor**

Run: `cd server && npm run typecheck && npm test`
Expected: sem erro de tipo; toda a suíte de `dashboardRules` passa.

Run: `cd server && npm run dev`
Expected: `Server running: http://localhost:3333` sem stack trace.

- [ ] **Step 5: Verificar o endpoint de ponta a ponta**

Com o servidor no ar, num outro terminal — trocar email/senha por um ADMIN real do banco:

```bash
TOKEN=$(curl -s -X POST http://localhost:3333/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@exemplo.com","password":"SENHA"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

curl -s "http://localhost:3333/dashboard/overview?days=7" \
  -H "Authorization: Bearer $TOKEN" | npx json-pretty 2>/dev/null \
  || curl -s "http://localhost:3333/dashboard/overview?days=7" -H "Authorization: Bearer $TOKEN"
```

Conferir: `range.days === 7`, `occupancyByBucket` com 7 itens, `team` listando todo colaborador do negócio, `kpis.occupancy.total` batendo com o número de horários que a agenda do colaborador mostra.

Conferir também os três controles de segurança:

```bash
# 403 — colaborador não acessa o dashboard do dono
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3333/dashboard/overview" \
  -H "Authorization: Bearer $TOKEN_DE_UM_EMPLOYEE"     # espera 403

# 400 — período fora do enum é recusado
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3333/dashboard/overview?days=45" \
  -H "Authorization: Bearer $TOKEN"                     # espera 400

# 401 — sem token
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3333/dashboard/overview"  # espera 401
```

Confirmar ainda que `?days=30` devolve `occupancyByBucket` com 5 buckets semanais.

- [ ] **Step 6: Commit**

```bash
git add server/src/repositories/dashboardRepository.ts \
        server/src/services/dashboardService.ts \
        server/src/controllers/dashboardController.ts \
        server/src/routes/dashboardRoutes.ts \
        server/src/server.ts
git commit -m "feat(server): expose admin dashboard overview endpoint"
```

---

## Task 6: Tipos e helpers puros no front

**Files:**
- Create: `web/lib/dashboard.ts`
- Test: `web/lib/dashboard.test.ts`

**Interfaces:**
- Consumes: o DTO da Task 5.
- Produces: `DashboardOverview` e tipos aninhados (`DashboardKpis`, `OccupancyBucket`, `HeatmapCell`, `TeamRow`, `ServiceRankRow`, `UpcomingBooking`, `DashboardAlert`, `PeriodDays`), `formatCurrency`, `formatPercent`, `heatIntensity`, `relativeDayLabel`, `groupUpcomingByDay`, `paceDelta`. Todos os componentes das Tasks 7–10 importam daqui.

- [ ] **Step 1: Write the failing test**

Criar `web/lib/dashboard.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UpcomingBooking,
  formatCurrency,
  formatPercent,
  groupUpcomingByDay,
  heatIntensity,
  paceDelta,
  relativeDayLabel,
} from "./dashboard";

// Intl pt-BR separa "R$" do número com espaço NÃO quebrável (U+00A0).
// Escrever um espaço comum aqui faz o teste falhar por um caractere invisível.
const NBSP = "\u00a0";

test("moeda formata a partir da string do Decimal", () => {
  assert.equal(formatCurrency("1250.5"), `R$${NBSP}1.250,50`);
  assert.equal(formatCurrency("0.00"), `R$${NBSP}0,00`);
});

test("percentual arredonda para inteiro", () => {
  assert.equal(formatPercent(0.256), "26%");
  assert.equal(formatPercent(0), "0%");
  assert.equal(formatPercent(1), "100%");
});

test("intensidade do heatmap distingue vazio de pouco ocupado", () => {
  assert.equal(heatIntensity(0), 0);
  assert.equal(heatIntensity(0.01), 1);
  assert.equal(heatIntensity(0.5), 2);
  assert.equal(heatIntensity(1), 4);
});

test("rótulo de dia marca hoje e amanhã", () => {
  assert.equal(relativeDayLabel("2026-07-25", "2026-07-25"), "Hoje");
  assert.equal(relativeDayLabel("2026-07-26", "2026-07-25"), "Amanhã");
});

test("rótulo de dia distante mostra data por extenso", () => {
  assert.equal(relativeDayLabel("2026-08-01", "2026-07-25"), "sáb, 01 ago");
});

test("virada de mês no amanhã continua sendo amanhã", () => {
  assert.equal(relativeDayLabel("2026-08-01", "2026-07-31"), "Amanhã");
});

test("agrupamento por dia preserva a ordem cronológica", () => {
  const row = (date: string, startTime: string): UpcomingBooking => ({
    availabilityId: Math.random(),
    date,
    startTime,
    endTime: "10:00",
    clientName: "Marcos",
    clientPhone: null,
    serviceName: null,
    employeeName: "Ana",
  });

  const groups = groupUpcomingByDay([
    row("2026-07-25", "09:00"),
    row("2026-07-25", "11:00"),
    row("2026-07-26", "09:00"),
  ]);

  assert.deepEqual(groups.map(([key]) => key), ["2026-07-25", "2026-07-26"]);
  assert.equal(groups[0][1].length, 2);
});

test("delta do ritmo compara os dois períodos", () => {
  assert.deepEqual(paceDelta(12, 8), { direction: "up", percent: 0.5 });
  assert.deepEqual(paceDelta(6, 8), { direction: "down", percent: -0.25 });
  assert.deepEqual(paceDelta(8, 8), { direction: "flat", percent: 0 });
});

test("período anterior zerado não vira divisão por zero", () => {
  assert.deepEqual(paceDelta(5, 0), { direction: "up", percent: null });
  assert.deepEqual(paceDelta(0, 0), { direction: "flat", percent: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test lib/dashboard.test.ts`
Expected: FAIL — módulo `./dashboard` não encontrado.

- [ ] **Step 3: Write minimal implementation**

Criar `web/lib/dashboard.ts`:

```ts
export type PeriodDays = 7 | 30 | 90;

export interface DashboardKpis {
  occupancy: { rate: number; booked: number; total: number };
  bookings: { total: number; online: number; manual: number };
  revenue: { scheduled: string; averageTicket: string };
  pace: { current: number; previous: number };
}

export interface OccupancyBucket {
  key: string;
  label: string;
  booked: number;
  free: number;
}

export interface HeatmapCell {
  weekday: number;
  hour: number;
  booked: number;
  total: number;
}

export interface TeamRow {
  id: number;
  name: string;
  pendingInvite: boolean;
  slots: number;
  booked: number;
  rate: number;
  revenue: string;
}

export interface ServiceRankRow {
  id: number;
  name: string;
  bookings: number;
  revenue: string;
  share: number;
}

export interface UpcomingBooking {
  availabilityId: number;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientPhone: string | null;
  serviceName: string | null;
  employeeName: string;
}

export type AlertKind =
  | "employee-no-slots"
  | "service-no-employee"
  | "day-fully-booked"
  | "pending-invite";

export interface DashboardAlert {
  kind: AlertKind;
  label: string;
  count: number;
}

export interface DashboardOverview {
  range: { days: number; from: string; to: string };
  kpis: DashboardKpis;
  occupancyByBucket: OccupancyBucket[];
  heatmap: HeatmapCell[];
  team: TeamRow[];
  services: ServiceRankRow[];
  upcoming: UpcomingBooking[];
  alerts: DashboardAlert[];
}

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function formatCurrency(value: string): string {
  return currency.format(Number(value));
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// 0 é um degrau próprio: célula sem nenhuma reserva precisa ler como vazia,
// não como "pouco ocupada".
export function heatIntensity(rate: number): number {
  if (rate <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil(rate * 4)));
}

function nextDayKey(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function relativeDayLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return "Hoje";
  if (dayKey === nextDayKey(todayKey)) return "Amanhã";

  const date = new Date(`${dayKey}T00:00:00.000Z`);
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]}, ${day} ${MONTHS[date.getUTCMonth()]}`;
}

export function groupUpcomingByDay(
  rows: UpcomingBooking[],
): [string, UpcomingBooking[]][] {
  const groups = new Map<string, UpcomingBooking[]>();

  for (const row of rows) {
    const list = groups.get(row.date) ?? [];
    list.push(row);
    groups.set(row.date, list);
  }

  return [...groups.entries()];
}

export function paceDelta(
  current: number,
  previous: number,
): { direction: "up" | "down" | "flat"; percent: number | null } {
  if (previous === 0) {
    return { direction: current > 0 ? "up" : "flat", percent: null };
  }

  const percent = (current - previous) / previous;
  if (percent === 0) return { direction: "flat", percent: 0 };

  return { direction: percent > 0 ? "up" : "down", percent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test && npm run typecheck`
Expected: PASS (toda a suíte de `lib/`, incluindo os testes já existentes).

- [ ] **Step 5: Commit**

```bash
git add web/lib/dashboard.ts web/lib/dashboard.test.ts
git commit -m "feat(web): add dashboard types and presentation helpers"
```

---

## Task 7: Casca da página, seletor de período e KPIs

**Files:**
- Create: `web/components/dashboard/panel.tsx`
- Create: `web/components/dashboard/period-selector.tsx`
- Create: `web/components/dashboard/kpi-cards.tsx`
- Create: `web/components/dashboard/placeholder-overview.tsx`
- Modify: `web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `DashboardOverview`, `PeriodDays`, `formatCurrency`, `formatPercent`, `paceDelta` (Task 6); `fetchAdapter`, `ApiError`; `useAuthUser`.
- Produces: `<Panel title action?>`, `<PeriodSelector value onChange disabled>`, `<KpiCards kpis days>`, `<PlaceholderOverview />`. As Tasks 8–10 montam seus painéis dentro de `<Panel>` e são plugadas no grid desta página.

**Antes de escrever JSX nesta task, invocar a skill `frontend-design`.** O objetivo declarado é "profissional, detalhado, moderno e bonito" — a skill calibra tipografia, densidade e hierarquia. Direção já fixada na spec: índigo do sistema como primária, `--chart-2..5` para categorias, `tabular-nums` em todo número comparável, hierarquia por peso e tamanho em vez de caixas coloridas.

- [ ] **Step 1: Criar a casca de painel compartilhada**

Criar `web/components/dashboard/panel.tsx`:

```tsx
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border bg-card shadow-sm",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Criar o seletor de período**

Criar `web/components/dashboard/period-selector.tsx`:

```tsx
"use client";

import { PeriodDays } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

const OPTIONS: PeriodDays[] = [7, 30, 90];

export function PeriodSelector({
  value,
  onChange,
  disabled,
}: {
  value: PeriodDays;
  onChange: (days: PeriodDays) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Período"
      className="inline-flex rounded-lg border bg-muted/40 p-0.5"
    >
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-colors disabled:opacity-50",
            value === option
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option} dias
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Criar os KPIs**

Criar `web/components/dashboard/kpi-cards.tsx`:

```tsx
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Calendar03Icon,
  ChartLineData01Icon,
  MoneyBag02Icon,
  PieChartIcon,
} from "@hugeicons/core-free-icons";
import {
  DashboardKpis,
  formatCurrency,
  formatPercent,
  paceDelta,
} from "@/lib/dashboard";
import { cn } from "@/lib/utils";

function Tile({
  label,
  value,
  hint,
  icon,
  children,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Calendar03Icon;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground/70" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">{hint}</p>
      {children}
    </div>
  );
}

export function KpiCards({ kpis, days }: { kpis: DashboardKpis; days: number }) {
  const delta = paceDelta(kpis.pace.current, kpis.pace.previous);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Taxa de ocupação"
        value={formatPercent(kpis.occupancy.rate)}
        hint={`${kpis.occupancy.booked} de ${kpis.occupancy.total} horários`}
        icon={PieChartIcon}
      >
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${Math.round(kpis.occupancy.rate * 100)}%` }}
          />
        </div>
      </Tile>

      <Tile
        label="Reservas no período"
        value={String(kpis.bookings.total)}
        hint={`${kpis.bookings.online} pelo site · ${kpis.bookings.manual} encaixes`}
        icon={Calendar03Icon}
      />

      <Tile
        label="Receita agendada"
        value={formatCurrency(kpis.revenue.scheduled)}
        hint={`Ticket médio ${formatCurrency(kpis.revenue.averageTicket)}`}
        icon={MoneyBag02Icon}
      />

      <Tile
        label="Ritmo de reservas"
        value={String(kpis.pace.current)}
        hint={`Criadas nos últimos ${days} dias`}
        icon={ChartLineData01Icon}
      >
        <p
          className={cn(
            "mt-4 inline-flex items-center gap-1 text-xs font-medium tabular-nums",
            delta.direction === "up" && "text-emerald-600 dark:text-emerald-400",
            delta.direction === "down" && "text-destructive",
            delta.direction === "flat" && "text-muted-foreground",
          )}
        >
          {delta.direction !== "flat" ? (
            <HugeiconsIcon
              icon={delta.direction === "up" ? ArrowUp01Icon : ArrowDown01Icon}
              className="size-3.5"
            />
          ) : null}
          {delta.percent === null
            ? `${kpis.pace.previous} no período anterior`
            : `${formatPercent(Math.abs(delta.percent))} vs. ${days} dias anteriores`}
        </p>
      </Tile>
    </div>
  );
}
```

Os oito ícones usados nesta task e na Task 10 (`ArrowUp01Icon`, `ArrowDown01Icon`,
`Calendar03Icon`, `ChartLineData01Icon`, `MoneyBag02Icon`, `PieChartIcon`, `Alert02Icon`,
`CheckmarkCircle02Icon`) foram verificados como existentes em
`@hugeicons/core-free-icons` — podem ser usados como estão.

- [ ] **Step 4: Extrair o placeholder atual**

Criar `web/components/dashboard/placeholder-overview.tsx` movendo o corpo atual de `web/app/dashboard/page.tsx` sem nenhuma mudança visual:

```tsx
import { AuthUser } from "@/lib/auth";

const placeholders = [
  { label: "Reservas hoje", value: "—" },
  { label: "Serviços ativos", value: "—" },
  { label: "Colaboradores", value: "—" },
];

export function PlaceholderOverview({ user }: { user: AuthUser }) {
  const firstName = user.name.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-xl font-semibold tracking-tight">
        Olá, {firstName} 👋
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {user.business
          ? `Aqui está o resumo de ${user.business.name}.`
          : "Aqui está o resumo da plataforma."}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {placeholders.map((item) => (
          <div key={item.label} className="rounded-2xl border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-dashed bg-card/50 p-8 text-center">
        <p className="text-sm font-medium">Seu negócio está quase pronto</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Os próximos passos — cadastrar serviços e convidar a equipe — chegam
          nas próximas fases.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Reescrever a página**

Substituir `web/app/dashboard/page.tsx` inteiro:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { PlaceholderOverview } from "@/components/dashboard/placeholder-overview";
import { DashboardOverview, PeriodDays } from "@/lib/dashboard";
import { useAuthUser } from "./auth-context";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className ?? ""}`} />;
}

export default function DashboardPage() {
  const user = useAuthUser();
  const isAdmin = user.role === "ADMIN";

  const [days, setDays] = useState<PeriodDays>(7);
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (period: PeriodDays) => {
      setLoading(true);
      return fetchAdapter<DashboardOverview>({
        method: "GET",
        path: `/dashboard/overview?days=${period}`,
      })
        .then(({ data: overview }) => {
          setData(overview);
          setError(null);
        })
        .catch((err) => {
          setError(err instanceof ApiError ? err.message : "Erro inesperado.");
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    if (isAdmin) load(days);
  }, [isAdmin, days, load]);

  if (!isAdmin) return <PlaceholderOverview user={user} />;

  const firstName = user.name.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Olá, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.business
              ? `Como está ${user.business.name} nos próximos ${days} dias.`
              : `Resumo dos próximos ${days} dias.`}
          </p>
        </div>
        <PeriodSelector value={days} onChange={setDays} disabled={loading} />
      </div>

      {error ? (
        <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium">{error}</p>
          <Button className="mt-4" size="sm" onClick={() => load(days)}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {!error && !data ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : null}

      {data ? (
        // Dados antigos ficam visíveis enquanto o novo período carrega:
        // desmontar faria o layout piscar a cada clique no seletor.
        <div
          aria-busy={loading}
          className={`mt-8 transition-opacity ${loading ? "opacity-50" : ""}`}
        >
          <KpiCards kpis={data.kpis} days={data.range.days} />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Verificar no navegador**

Run: `cd web && npm run typecheck && npm run lint`
Expected: sem erro.

Run: `cd web && npm run dev` (com o server rodando em paralelo), abrir `http://localhost:3000/dashboard` logado como ADMIN.
Expected: saudação, seletor 7/30/90 funcional (trocar o período refaz o fetch sem piscar), quatro KPIs com números reais. Logar como EMPLOYEE: o placeholder antigo aparece igual ao de antes.

- [ ] **Step 7: Commit**

```bash
git add web/components/dashboard web/app/dashboard/page.tsx
git commit -m "feat(web): add dashboard shell, period selector and kpi tiles"
```

---

## Task 8: Gráfico de ocupação e mapa de calor

**Files:**
- Create: `web/components/dashboard/occupancy-chart.tsx`
- Create: `web/components/dashboard/occupancy-heatmap.tsx`
- Modify: `web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `OccupancyBucket`, `HeatmapCell`, `formatPercent`, `heatIntensity` (Task 6); `<Panel>` (Task 7).
- Produces: `<OccupancyChart buckets>`, `<OccupancyHeatmap cells>`.

- [ ] **Step 1: Criar o gráfico de ocupação**

Criar `web/components/dashboard/occupancy-chart.tsx`:

```tsx
import { OccupancyBucket, formatPercent } from "@/lib/dashboard";

export function OccupancyChart({ buckets }: { buckets: OccupancyBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.booked + b.free));
  const totalBooked = buckets.reduce((sum, b) => sum + b.booked, 0);
  const totalSlots = buckets.reduce((sum, b) => sum + b.booked + b.free, 0);

  if (totalSlots === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhum horário aberto neste período.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatPercent(totalBooked / totalSlots)}
        </span>
        <span className="text-xs text-muted-foreground">ocupado no período</span>
      </div>

      <div className="mt-6 flex h-44 items-end gap-2">
        {buckets.map((bucket) => {
          const total = bucket.booked + bucket.free;
          const height = (total / max) * 100;
          const bookedShare = total === 0 ? 0 : (bucket.booked / total) * 100;

          return (
            <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center">
              <div
                className="flex w-full flex-col justify-end rounded-md bg-muted/60"
                style={{ height: `${Math.max(height, 2)}%` }}
                // O title é a camada de detalhe: o eixo mostra a forma, o hover
                // mostra o número exato sem poluir a barra.
                title={`${bucket.label}: ${bucket.booked} ocupados de ${total}`}
              >
                <div
                  className="w-full rounded-md bg-primary transition-[height] duration-500"
                  style={{ height: `${bookedShare}%` }}
                />
              </div>
              <span className="mt-2 w-full truncate text-center text-[11px] text-muted-foreground tabular-nums">
                {bucket.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Ocupado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-muted-foreground/30" /> Livre
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar o mapa de calor**

Criar `web/components/dashboard/occupancy-heatmap.tsx`:

```tsx
import { HeatmapCell, formatPercent, heatIntensity } from "@/lib/dashboard";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Rampa de opacidade da primária: uma única cor evita que o olho leia
// diferença de matiz como diferença de categoria.
const LEVELS = [
  "bg-muted/50",
  "bg-primary/20",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

export function OccupancyHeatmap({ cells }: { cells: HeatmapCell[] }) {
  if (cells.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Sem horários suficientes para desenhar o mapa.
      </p>
    );
  }

  const hours = [...new Set(cells.map((cell) => cell.hour))].sort((a, b) => a - b);
  const byKey = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell]));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `2.5rem repeat(${hours.length}, minmax(0, 1fr))` }}
        >
          <span />
          {hours.map((hour) => (
            <span
              key={hour}
              className="text-center text-[10px] text-muted-foreground tabular-nums"
            >
              {String(hour).padStart(2, "0")}h
            </span>
          ))}

          {WEEKDAYS.map((label, weekday) => (
            <Row key={label} label={label} weekday={weekday} hours={hours} byKey={byKey} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
          <span>Menos</span>
          {LEVELS.map((level, index) => (
            <span key={index} className={`size-3 rounded-sm ${level}`} />
          ))}
          <span>Mais</span>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  weekday,
  hours,
  byKey,
}: {
  label: string;
  weekday: number;
  hours: number[];
  byKey: Map<string, HeatmapCell>;
}) {
  return (
    <>
      <span className="flex items-center text-[11px] text-muted-foreground">
        {label}
      </span>
      {hours.map((hour) => {
        const cell = byKey.get(`${weekday}-${hour}`);
        const rate = cell && cell.total > 0 ? cell.booked / cell.total : 0;
        const level = cell ? heatIntensity(rate) : 0;

        return (
          <span
            key={hour}
            className={`h-6 rounded-sm ${cell ? LEVELS[level] : "bg-muted/20"}`}
            title={
              cell
                ? `${label} ${String(hour).padStart(2, "0")}h — ${cell.booked}/${cell.total} (${formatPercent(rate)})`
                : `${label} ${String(hour).padStart(2, "0")}h — sem horários`
            }
          />
        );
      })}
    </>
  );
}
```

- [ ] **Step 3: Plugar no grid da página**

Em `web/app/dashboard/page.tsx`, adicionar os imports:

```tsx
import { OccupancyChart } from "@/components/dashboard/occupancy-chart";
import { OccupancyHeatmap } from "@/components/dashboard/occupancy-heatmap";
import { Panel } from "@/components/dashboard/panel";
```

e, dentro do bloco `{data ? (…)}`, logo depois de `<KpiCards … />`:

```tsx
          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <Panel
              title="Ocupação"
              description={
                data.range.days === 7 ? "Dia a dia" : "Por semana"
              }
              className="lg:col-span-8"
            >
              <OccupancyChart buckets={data.occupancyByBucket} />
            </Panel>
          </div>

          <div className="mt-4 grid gap-4">
            <Panel
              title="Mapa de demanda"
              description="Quando sua agenda enche, por dia da semana e hora"
            >
              <OccupancyHeatmap cells={data.heatmap} />
            </Panel>
          </div>
```

A coluna de 4 restante ao lado de "Ocupação" fica vazia nesta task — a Task 10 preenche com "Pontos de atenção".

- [ ] **Step 4: Verificar no navegador**

Run: `cd web && npm run typecheck && npm run lint`
Expected: sem erro.

Abrir `/dashboard` como ADMIN.
Expected: barras empilhadas com 7 colunas em "7 dias" e 5 colunas rotuladas por semana em "30 dias"; hover mostra a contagem exata; mapa de calor com uma linha por dia da semana e colunas só nas horas que existem na agenda; rolagem horizontal do mapa em tela estreita **sem** a página inteira rolar na horizontal.

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/occupancy-chart.tsx \
        web/components/dashboard/occupancy-heatmap.tsx \
        web/app/dashboard/page.tsx
git commit -m "feat(web): add occupancy chart and demand heatmap"
```

---

## Task 9: Painéis de equipe e de serviços

**Files:**
- Create: `web/components/dashboard/team-panel.tsx`
- Create: `web/components/dashboard/services-panel.tsx`
- Modify: `web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `TeamRow`, `ServiceRankRow`, `formatCurrency`, `formatPercent` (Task 6); `<Panel>` (Task 7); `Badge` de `@/components/ui/badge`.
- Produces: `<TeamPanel rows>`, `<ServicesPanel rows>`.

- [ ] **Step 1: Criar o painel de equipe**

Criar `web/components/dashboard/team-panel.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { TeamRow, formatCurrency, formatPercent } from "@/lib/dashboard";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function TeamPanel({ rows }: { rows: TeamRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhum colaborador cadastrado ainda.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {initials(row.name)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{row.name}</p>
              {row.pendingInvite ? (
                <Badge variant="outline" className="shrink-0">
                  convite pendente
                </Badge>
              ) : null}
            </div>

            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${Math.round(row.rate * 100)}%` }}
              />
            </div>

            <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
              {row.slots === 0
                ? "Sem horários abertos"
                : `${row.booked} de ${row.slots} horários · ${formatCurrency(row.revenue)}`}
            </p>
          </div>

          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {row.slots === 0 ? "—" : formatPercent(row.rate)}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Criar o painel de serviços**

Criar `web/components/dashboard/services-panel.tsx`:

```tsx
import { ServiceRankRow, formatCurrency, formatPercent } from "@/lib/dashboard";

// Cores de categoria vêm dos tokens de chart do tema, não de hex solto.
const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function ServicesPanel({ rows }: { rows: ServiceRankRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhuma reserva de serviço neste período.
      </p>
    );
  }

  const max = Math.max(...rows.map((row) => row.share));

  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row, index) => (
        <li key={row.id}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium">{row.name}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums">
              {formatCurrency(row.revenue)}
            </p>
          </div>

          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${max === 0 ? 0 : Math.round((row.share / max) * 100)}%`,
                backgroundColor: COLORS[index % COLORS.length],
              }}
            />
          </div>

          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {row.bookings} {row.bookings === 1 ? "reserva" : "reservas"} ·{" "}
            {formatPercent(row.share)} da receita
          </p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Plugar no grid**

Em `web/app/dashboard/page.tsx`, adicionar os imports:

```tsx
import { ServicesPanel } from "@/components/dashboard/services-panel";
import { TeamPanel } from "@/components/dashboard/team-panel";
```

e, depois do bloco do mapa de calor:

```tsx
          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <Panel
              title="Equipe"
              description="Ordenado por ocupação no período"
              className="lg:col-span-7"
            >
              <TeamPanel rows={data.team} />
            </Panel>

            <Panel
              title="Serviços"
              description="Participação na receita agendada"
              className="lg:col-span-5"
            >
              <ServicesPanel rows={data.services} />
            </Panel>
          </div>
```

- [ ] **Step 4: Verificar no navegador**

Run: `cd web && npm run typecheck && npm run lint`
Expected: sem erro.

Abrir `/dashboard` como ADMIN.
Expected: todo colaborador do negócio aparece; quem não tem agenda mostra "Sem horários abertos" e `—` no lugar do percentual, no fim da lista; convite pendente aparece com badge; serviços ordenados por receita com barras de cores distintas; percentuais dos serviços somando ~100%.

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/team-panel.tsx \
        web/components/dashboard/services-panel.tsx \
        web/app/dashboard/page.tsx
git commit -m "feat(web): add team and services dashboard panels"
```

---

## Task 10: Próximas reservas, pontos de atenção e estado vazio

**Files:**
- Create: `web/components/dashboard/upcoming-bookings.tsx`
- Create: `web/components/dashboard/attention-panel.tsx`
- Modify: `web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `UpcomingBooking`, `DashboardAlert`, `groupUpcomingByDay`, `relativeDayLabel` (Task 6); `<Panel>` (Task 7).
- Produces: `<UpcomingBookings rows todayKey>`, `<AttentionPanel alerts>`. Última task — nada depende dela.

- [ ] **Step 1: Criar a lista de próximas reservas**

Criar `web/components/dashboard/upcoming-bookings.tsx`:

```tsx
import {
  UpcomingBooking,
  groupUpcomingByDay,
  relativeDayLabel,
} from "@/lib/dashboard";

export function UpcomingBookings({
  rows,
  todayKey,
}: {
  rows: UpcomingBooking[];
  todayKey: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhuma reserva à frente. Abra horários para a equipe receber clientes.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groupUpcomingByDay(rows).map(([dayKey, items]) => (
        <div key={dayKey}>
          <p className="text-xs font-semibold tracking-tight text-muted-foreground uppercase">
            {relativeDayLabel(dayKey, todayKey)}
          </p>

          <ul className="mt-3 flex flex-col divide-y">
            {items.map((row) => (
              <li
                key={row.availabilityId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
              >
                <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">
                  {row.startTime}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.clientName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {/* Encaixe manual não tem serviço: dizer isso é mais útil
                        do que deixar a linha pela metade. */}
                    {row.serviceName ?? "Encaixe manual"} · {row.employeeName}
                  </p>
                </div>

                {row.clientPhone ? (
                  <a
                    href={`tel:${row.clientPhone}`}
                    className="shrink-0 text-xs text-muted-foreground tabular-nums hover:text-foreground"
                  >
                    {row.clientPhone}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Criar o painel de atenção**

Criar `web/components/dashboard/attention-panel.tsx`:

```tsx
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { AlertKind, DashboardAlert } from "@/lib/dashboard";

// Cada alerta aponta para onde ele se resolve — alerta sem destino é ruído.
const DESTINATIONS: Record<AlertKind, { href: string; cta: string }> = {
  "employee-no-slots": { href: "/dashboard/team", cta: "Ver equipe" },
  "service-no-employee": { href: "/dashboard/services", cta: "Ver serviços" },
  "day-fully-booked": { href: "/dashboard/team", cta: "Ver equipe" },
  "pending-invite": { href: "/dashboard/team", cta: "Ver equipe" },
};

export function AttentionPanel({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="size-6 text-emerald-600 dark:text-emerald-400"
        />
        <p className="mt-3 text-sm font-medium">Tudo em ordem</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Equipe com agenda aberta e serviços atribuídos.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {alerts.map((alert) => {
        const destination = DESTINATIONS[alert.kind];

        return (
          <li
            key={alert.kind}
            className="flex items-start gap-3 rounded-xl border bg-muted/30 p-3"
          >
            <HugeiconsIcon
              icon={Alert02Icon}
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{alert.label}</p>
              <Link
                href={destination.href}
                className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
              >
                {destination.cta}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: Fechar o grid e adicionar o estado vazio**

Em `web/app/dashboard/page.tsx`, adicionar os imports:

```tsx
import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { UpcomingBookings } from "@/components/dashboard/upcoming-bookings";
```

Preencher a coluna vazia ao lado de "Ocupação" (bloco da Task 8):

```tsx
            <Panel
              title="Pontos de atenção"
              className="lg:col-span-4"
            >
              <AttentionPanel alerts={data.alerts} />
            </Panel>
```

Adicionar o painel operacional depois do bloco de equipe/serviços:

```tsx
          <div className="mt-4 grid gap-4">
            <Panel
              title="Próximas reservas"
              description="As 8 próximas, independente do período selecionado"
            >
              <UpcomingBookings rows={data.upcoming} todayKey={data.range.from} />
            </Panel>
          </div>
```

E, logo antes do bloco `{data ? (…)}`, o estado vazio real — negócio que nunca criou nada não deve ver um dashboard de zeros:

```tsx
      {data &&
      data.kpis.occupancy.total === 0 &&
      data.upcoming.length === 0 &&
      data.team.every((row) => row.slots === 0) ? (
        <div className="mt-8 rounded-2xl border border-dashed bg-card/50 p-10 text-center">
          <p className="text-sm font-medium">Seu dashboard está esperando dados</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Assim que a equipe abrir horários e as primeiras reservas entrarem,
            os números aparecem aqui automaticamente.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button size="sm" render={<Link href="/dashboard/team" />}>
              Convidar equipe
            </Button>
            <Button size="sm" variant="outline" render={<Link href="/dashboard/services" />}>
              Cadastrar serviços
            </Button>
          </div>
        </div>
      ) : null}
```

Envolver todo o bloco `{data ? (…)}` na condição inversa, de modo que o dashboard cheio
e o estado vazio nunca apareçam juntos. `Link` precisa ser importado de `next/link`.

`render={<Link href="…" />}` é o idioma correto: o `Button` deste projeto embrulha o
`Button` do base-ui, cujo `BaseUIComponentProps` expõe `render` — mesmo padrão já usado
em `web/components/ui/alert-dialog.tsx:168`. Não é `asChild`.

- [ ] **Step 4: Verificação final**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS.

Run: `cd web && npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS, build sem erro.

No navegador, como ADMIN:
- Os três períodos (7/30/90) carregam sem piscar e sem erro no console.
- "Próximas reservas" não muda ao trocar o período — é o comportamento pretendido.
- "Hoje" e "Amanhã" aparecem como rótulo nos grupos certos.
- Encaixe manual aparece como "Encaixe manual" e sem telefone.
- Alertas linkam para as páginas certas; negócio saudável mostra "Tudo em ordem".
- Layout empilha corretamente em 375px de largura, sem rolagem horizontal da página.
- Alternar tema claro/escuro: heatmap, barras e cores de serviço legíveis nos dois.

Como EMPLOYEE: `/dashboard` continua mostrando o placeholder antigo, sem chamar `/dashboard/overview`.

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/upcoming-bookings.tsx \
        web/components/dashboard/attention-panel.tsx \
        web/app/dashboard/page.tsx
git commit -m "feat(web): add upcoming bookings, attention panel and empty state"
```

---

## Cobertura da spec

| Seção da spec | Task |
|---|---|
| §1 semântica `isBooked` / online vs. manual | 1, 4 |
| §1 tendência por `Booking.createdAt` | 1 (regra), 5 (query) |
| §1 convenção de data UTC | 2, 5 |
| §1 corte do passado no dia de hoje | 4 |
| §2 DTO completo e querystring | 5, 6 |
| §3 repository / rules / service / controller / routes | 1–5 |
| §3 autorização ADMIN + `requireBusinessId` | 5 |
| §4 arquivos web e componentes | 6–10 |
| §4 layout em grid de 12 colunas | 7–10 |
| §4 estados: skeleton, troca sem piscar, erro, vazio | 7, 10 |
| §4 direção visual | 7 (skill `frontend-design`) |
| §5 testes de servidor | 1–4 |
| §5 testes de web | 6 |
| §5 verificação ponta a ponta | 5, 10 |
