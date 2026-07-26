# Paginação da agenda do colaborador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /availabilities` deixa de devolver todos os horários do colaborador de uma
vez e passa a paginar por dia (7 dias por página), com o front navegando por
Anterior/Próxima em vez de carregar tudo.

**Architecture:** O corte upcoming/passado e a paginação saem do cliente (que hoje busca
tudo e recorta em memória) e vão para o servidor. O servidor conta quantos dias distintos
existem de cada lado de "hoje", busca só as datas da página pedida e, com essas datas em
mãos, busca os horários daqueles dias. O front manda `tab`/`page` na querystring e
sincroniza seu estado com o `page` que volta na resposta (o servidor clampa páginas fora
do intervalo válido).

**Tech Stack:** Fastify 5 · Prisma 6.1 (PostgreSQL) · Next.js 16 · React 19 ·
shadcn-over-Base-UI · testes `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-26-agenda-paginacao-design.md`

**Branch:** `feat/business-settings` (mesma branch em andamento).

## Global Constraints

- Todo schema JSON de rota Fastify novo inclui `additionalProperties: false`.
- Camadas: `routes` → `controller` (fino, zero lógica) → `service` → `repository`. Regra de negócio pura vai em módulo que não importa Prisma.
- Mensagens de erro do servidor em inglês; UI em português; comentários em português explicando o PORQUÊ.
- Servidor: `cd server && npm test` (baseline 96/96) e `npm run typecheck`.
- Web: `cd web && npm test` (baseline 62/62), `npm run typecheck`, `npm run lint`, `npm run build`.
- **Lint:** dois problemas PRÉ-EXISTENTES no web, não desta branch — erro em `web/app/landing-header.tsx:19`, aviso em `web/app/dashboard/layout.tsx`. A barra é: nenhum problema NOVO nos arquivos tocados.
- A tela de agenda só é visível para `role === "EMPLOYEE"` (`web/app/dashboard/schedule/page.tsx:119`) — testar logado como colaborador.
- "Hoje", no servidor, é a meia-noite UTC do relógio da máquina — mesma convenção que `generateAvailabilities` já usa (`server/src/services/availabilityService.ts:100`).

---

### Task 1: Regras puras de paginação por dia

**Files:**
- Modify: `server/src/services/availabilityRules.ts`
- Test: `server/src/services/availabilityRules.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `utcMidnight(date: Date): Date`, `totalPagesFor(totalDays: number, pageSize: number): number`, `clampPage(page: number, totalPages: number): number`. A Task 3 importa os três.

- [ ] **Step 1: Write the failing tests**

Em `server/src/services/availabilityRules.test.ts`, atualizar o import do topo para
incluir as três funções novas:

```ts
import {
  buildAvailabilityData,
  clampPage,
  normalizeClientName,
  toAvailabilityDto,
  totalPagesFor,
  utcMidnight,
} from "./availabilityRules";
```

E acrescentar no fim do arquivo:

```ts
test("utcMidnight zera a hora e mantém o dia UTC", () => {
  const result = utcMidnight(new Date("2026-07-25T23:47:12.000Z"));
  assert.equal(result.toISOString(), "2026-07-25T00:00:00.000Z");
});

test("utcMidnight numa data já em meia-noite não muda", () => {
  const result = utcMidnight(new Date("2026-07-25T00:00:00.000Z"));
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

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/services/availabilityRules.test.ts`
Expected: FAIL — `utcMidnight`/`totalPagesFor`/`clampPage` não existem em `./availabilityRules`.

- [ ] **Step 3: Write minimal implementation**

Acrescentar no fim de `server/src/services/availabilityRules.ts`:

```ts
// "Hoje" no fuso do servidor: mesma convenção que generateAvailabilities já usa
// para montar Date a partir de "YYYY-MM-DDT00:00:00.000Z". O `date` gravado
// é sempre meia-noite UTC do dia — comparar direto contra `new Date()` sem
// zerar a hora daria "hoje" errado a qualquer hora depois das 00:00 UTC.
export function utcMidnight(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function totalPagesFor(totalDays: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalDays / pageSize));
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/services/availabilityRules.test.ts && npm run typecheck`
Expected: os 8 testes novos PASS (mais os 9 que já existiam no arquivo), typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/availabilityRules.ts server/src/services/availabilityRules.test.ts
git commit -m "feat(server): add pure pagination helpers for the schedule"
```

---

### Task 2: Repositório — datas paginadas

**Files:**
- Modify: `server/src/repositories/availabilityRepository.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `ScheduleDirection` (`"upcoming" | "past"`), `countDates(employeeId, direction, todayStart): Promise<number>`, `findDatesPage(employeeId, direction, todayStart, skip, take): Promise<{ date: Date }[]>`, `findManyByEmployeeForDates(employeeId, dates: Date[])`. A Task 3 importa os quatro.

Sem teste unitário: são queries Prisma, e o projeto não tem banco de teste — o padrão
existente (`findManyByEmployee`, `findManyFreeByEmployee` etc.) também não tem. A
verificação é end-to-end na Task 3, depois que a rota estiver de pé. Esta task só
acrescenta métodos — `findManyByEmployee`, ainda usado pelo service atual, continua no
lugar até a Task 3 trocar quem o chama.

- [ ] **Step 1: Acrescentar o tipo e os três métodos**

Em `server/src/repositories/availabilityRepository.ts`, logo abaixo do import do `prisma`
e antes de `export const availabilityRepository = {`:

```ts
export type ScheduleDirection = "upcoming" | "past";

// Não exportado: não é regra de negócio, é só "de que lado de hoje" vira
// filtro do Prisma. countDates e findDatesPage compartilham a mesma escolha.
function sideOfToday(direction: ScheduleDirection, todayStart: Date) {
  return direction === "upcoming" ? { gte: todayStart } : { lt: todayStart };
}
```

E dentro do objeto `availabilityRepository`, logo depois de `findManyByEmployee`:

```ts
  countDates(employeeId: number, direction: ScheduleDirection, todayStart: Date) {
    return prisma.availability
      .groupBy({
        by: ["date"],
        where: { employeeId, date: sideOfToday(direction, todayStart) },
      })
      .then((rows) => rows.length);
  },

  findDatesPage(
    employeeId: number,
    direction: ScheduleDirection,
    todayStart: Date,
    skip: number,
    take: number,
  ) {
    return prisma.availability.findMany({
      where: { employeeId, date: sideOfToday(direction, todayStart) },
      distinct: ["date"],
      orderBy: { date: direction === "upcoming" ? "asc" : "desc" },
      skip,
      take,
      select: { date: true },
    });
  },

  // Sempre crescente, nos dois modos: quem decide se os DIAS aparecem em
  // ordem inversa (aba Passados) é o front, na exibição — os horários DENTRO
  // de cada dia continuam crescentes nos dois casos.
  findManyByEmployeeForDates(employeeId: number, dates: Date[]) {
    return prisma.availability.findMany({
      where: { employeeId, date: { in: dates } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: withBooking,
    });
  },
```

- [ ] **Step 2: Verificar**

Run: `cd server && npm run typecheck`
Expected: limpo. (Nada consome os métodos novos ainda — é só checagem de sintaxe/tipos.)

- [ ] **Step 3: Commit**

```bash
git add server/src/repositories/availabilityRepository.ts
git commit -m "feat(server): add day-paginated queries to the availability repository"
```

---

### Task 3: `GET /availabilities` paginado (service + controller + rota)

**Files:**
- Modify: `server/src/services/availabilityService.ts`
- Modify: `server/src/repositories/availabilityRepository.ts` (remover `findManyByEmployee`, agora sem uso)
- Modify: `server/src/controllers/availabilityController.ts`
- Modify: `server/src/routes/availabilityRoutes.ts`

**Interfaces:**
- Consumes: `utcMidnight`, `totalPagesFor`, `clampPage` (Task 1); `ScheduleDirection`, `countDates`, `findDatesPage`, `findManyByEmployeeForDates` (Task 2).
- Produces: `GET /availabilities?tab=upcoming|past&page=N` respondendo `{ availabilities, page, totalPages }`. A Task 5 consome.

Service, controller e rota mudam juntos nesta task porque a assinatura de
`listAvailabilities` muda: deixar o controller chamando a assinatura antiga quebraria o
typecheck até a rota também estar pronta — não faz sentido separar em tasks que não
compilam sozinhas.

- [ ] **Step 1: Reescrever o service**

Em `server/src/services/availabilityService.ts`, atualizar o import de
`./availabilityRules` para incluir as três funções novas, e importar `ScheduleDirection`
do repositório:

```ts
import { availabilityRepository, ScheduleDirection } from "../repositories/availabilityRepository";
import { planAvailabilities } from "./availabilityGenerator";
import {
  AvailabilityInput,
  AvailabilityRow,
  buildAvailabilityData,
  clampPage,
  toAvailabilityDto,
  totalPagesFor,
  utcMidnight,
} from "./availabilityRules";
```

Substituir o método `listAvailabilities` atual:

```ts
  async listAvailabilities(employeeId: number) {
    const availabilities = await availabilityRepository.findManyByEmployee(employeeId);
    return availabilities.map(toAvailabilityDto);
  },
```

por:

```ts
  async listAvailabilities(
    employeeId: number,
    params: { tab: ScheduleDirection; page: number },
    now: Date,
  ) {
    const PAGE_SIZE = 7;
    const todayStart = utcMidnight(now);

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

    // Sem dia nenhum na página (aba vazia, ou página pedida além do fim antes
    // do clamp): pula a segunda query, não sobra data pra filtrar.
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

- [ ] **Step 2: Remover o método morto do repositório**

Em `server/src/repositories/availabilityRepository.ts`, apagar o método
`findManyByEmployee` inteiro (era o único chamador, e acabou de sair do service):

```ts
  findManyByEmployee(employeeId: number) {
    return prisma.availability.findMany({
      where: { employeeId },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: withBooking,
    });
  },
```

- [ ] **Step 3: Controller**

Em `server/src/controllers/availabilityController.ts`, substituir:

```ts
export async function listAvailabilities(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const availabilities = await availabilityService.listAvailabilities(request.user.sub);
  reply.send({ availabilities });
}
```

por:

```ts
export interface ListAvailabilitiesQuery {
  tab?: "upcoming" | "past";
  page?: number;
}

export async function listAvailabilities(
  request: FastifyRequest<{ Querystring: ListAvailabilitiesQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const tab = request.query.tab === "past" ? "past" : "upcoming";
  const page = request.query.page ?? 1;

  const result = await availabilityService.listAvailabilities(
    request.user.sub,
    { tab, page },
    new Date(),
  );

  reply.send(result);
}
```

- [ ] **Step 4: Rota**

Em `server/src/routes/availabilityRoutes.ts`, incluir `ListAvailabilitiesQuery` no import
do controller:

```ts
import {
  createAvailability,
  deleteAvailability,
  generateAvailabilities,
  listAvailabilities,
  updateAvailability,
  AvailabilityBody,
  AvailabilityParams,
  GenerateAvailabilitiesBody,
  ListAvailabilitiesQuery,
} from "../controllers/availabilityController";
```

Acrescentar o schema, ao lado dos outros:

```ts
const listAvailabilitiesSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      tab: { type: "string", enum: ["upcoming", "past"] },
      page: { type: "integer", minimum: 1 },
    },
  },
};
```

E trocar o registro da rota GET:

```ts
  app.get(
    "/availabilities",
    { preHandler: [authenticate, authorize(Role.EMPLOYEE)] },
    listAvailabilities,
  );
```

por:

```ts
  app.get<{ Querystring: ListAvailabilitiesQuery }>(
    "/availabilities",
    {
      schema: listAvailabilitiesSchema,
      preHandler: [authenticate, authorize(Role.EMPLOYEE)],
    },
    listAvailabilities,
  );
```

- [ ] **Step 5: Verificar end-to-end**

```bash
cd server && npm run typecheck && npm test
npm run dev   # em outro terminal
```

Precisa de um colaborador (EMPLOYEE) com convite aceito e mais de 7 dias de horários
cadastrados. Se não tiver um à mão: crie um pela tela de Equipe, aceite o convite (o link
sai no console do servidor — Resend ainda não está ligado), faça login como ele e use
"Gerar horários" (`POST /availabilities/generate`) pedindo ~21 dias, todos os dias da
semana, para ter 3 páginas de 7 dias.

```bash
T=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<email do colaborador>","password":"<senha>"}' | jq -r .token)

# 1. página 1 de próximos: até 7 dias distintos, totalPages bate com o gerado
curl -s "localhost:3333/availabilities?tab=upcoming&page=1" -H "Authorization: Bearer $T" \
  | jq '{page, totalPages, dias: ([.availabilities[].date[0:10]] | unique | length)}'

# 2. página 2 não repete nem pula dia: menor data da página 2 é depois da maior da página 1
curl -s "localhost:3333/availabilities?tab=upcoming&page=2" -H "Authorization: Bearer $T" \
  | jq '[.availabilities[].date[0:10]] | unique'

# 3. pedir uma página muito além do fim devolve a última válida (clamp)
curl -s "localhost:3333/availabilities?tab=upcoming&page=999" -H "Authorization: Bearer $T" \
  | jq '{page, totalPages}'

# 4. tab inválida ou page não-inteiro → 400 (schema)
curl -s -o /dev/null -w '%{http_code}\n' "localhost:3333/availabilities?tab=invalida" \
  -H "Authorization: Bearer $T"
curl -s -o /dev/null -w '%{http_code}\n' "localhost:3333/availabilities?page=0" \
  -H "Authorization: Bearer $T"

# 5. sem horário passado nenhum: página 1 de passados vem vazia, totalPages 1
curl -s "localhost:3333/availabilities?tab=past&page=1" -H "Authorization: Bearer $T" \
  | jq '{page, totalPages, vazio: (.availabilities | length == 0)}'
```

Expected: (1) `dias` ≤ 7 e `totalPages` = 3 (com ~21 dias gerados); (2) datas da página 2
todas maiores que as da página 1, sem sobreposição; (3) `page` igual a `totalPages` (o
pedido de 999 volta clampado); (4) `400` nos dois; (5) `vazio: true`, `totalPages: 1` — se
o colaborador realmente não tem nada no passado ainda.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/availabilityService.ts server/src/repositories/availabilityRepository.ts \
        server/src/controllers/availabilityController.ts server/src/routes/availabilityRoutes.ts
git commit -m "feat(server): paginate GET /availabilities by day"
```

---

### Task 4: Front — `orderDayGroups` e remoção de `partitionByDay`

**Files:**
- Modify: `web/lib/schedule.ts`
- Modify: `web/lib/schedule.test.ts`

**Interfaces:**
- Consumes: `Availability` (`web/lib/types.ts`), `groupByDate` (já existe em `schedule.ts`).
- Produces: `orderDayGroups(groups: [string, Availability[]][], tab: "upcoming" | "past"): [string, Availability[]][]`. A Task 5 importa.

`partitionByDay` sai porque o corte upcoming/passado passou a ser do servidor (Task 3) —
o front não recebe mais a lista inteira pra recortar em memória.

- [ ] **Step 1: Write the failing tests**

Em `web/lib/schedule.test.ts`, trocar o import:

```ts
import {
  formatDuration,
  formatMinutes,
  groupByDate,
  localDayKey,
  orderDayGroups,
  summarizeDay,
  toMinutes,
} from "./schedule.ts";
```

Remover o teste `"separa futuros de passados incluindo hoje nos futuros"` (o que chama
`partitionByDay`) e acrescentar no lugar:

```ts
test("orderDayGroups mantém a ordem recebida para próximos", () => {
  const groups = groupByDate([
    slot({ id: 1, date: "2026-07-25T00:00:00.000Z" }),
    slot({ id: 2, date: "2026-07-26T00:00:00.000Z" }),
  ]);

  assert.deepEqual(
    orderDayGroups(groups, "upcoming").map(([day]) => day),
    ["2026-07-25", "2026-07-26"],
  );
});

// Bug corrigido nesta entrega: a versão antiga invertia a lista inteira antes
// de agrupar, o que também invertia a ordem dos horários DENTRO de cada dia.
// orderDayGroups só inverte a ordem dos GRUPOS — cada Availability[] interno
// continua na ordem em que chegou (crescente).
test("orderDayGroups para passados inverte os dias, não os horários de cada dia", () => {
  const groups = groupByDate([
    slot({ id: 1, date: "2026-07-24T00:00:00.000Z", startTime: "09:00" }),
    slot({ id: 2, date: "2026-07-24T00:00:00.000Z", startTime: "11:00" }),
    slot({ id: 3, date: "2026-07-25T00:00:00.000Z" }),
  ]);

  const ordered = orderDayGroups(groups, "past");

  assert.deepEqual(
    ordered.map(([day]) => day),
    ["2026-07-25", "2026-07-24"],
  );
  assert.deepEqual(
    ordered[1][1].map((s) => s.id),
    [1, 2],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx --test lib/schedule.test.ts`
Expected: FAIL — `orderDayGroups` não existe em `./schedule.ts` (e o import antigo de
`partitionByDay` já deixou de existir no arquivo de teste, então só falta a implementação).

- [ ] **Step 3: Write minimal implementation**

Em `web/lib/schedule.ts`, remover a função inteira:

```ts
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
```

E acrescentar no lugar:

```ts
// upcoming: os dias já chegam do servidor na ordem certa (mais próximo primeiro).
// past: o servidor devolve os horários sempre crescentes por dia; só a ORDEM DOS
// DIAS precisa inverter aqui (mais recente primeiro), nunca os horários dentro
// de um dia.
export function orderDayGroups(
  groups: [string, Availability[]][],
  tab: "upcoming" | "past",
): [string, Availability[]][] {
  return tab === "past" ? [...groups].reverse() : groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test && npm run typecheck`
Expected: falha só o teste que ainda referenciar `partitionByDay` fora deste arquivo (não
deveria haver nenhum — ver Task 5); os testes de `schedule.test.ts` todos PASS; typecheck
vai acusar `web/app/dashboard/schedule/page.tsx` quebrado até a Task 5 (ele ainda importa
`partitionByDay`) — **esperado nesta task**, resolvido na próxima.

- [ ] **Step 5: Commit**

```bash
git add web/lib/schedule.ts web/lib/schedule.test.ts
git commit -m "feat(web): replace partitionByDay with orderDayGroups"
```

---

### Task 5: Front — tela paginada

**Files:**
- Modify: `web/app/dashboard/schedule/page.tsx`

**Interfaces:**
- Consumes: `orderDayGroups` (Task 4); `GET /availabilities?tab=&page=` respondendo `{ availabilities, page, totalPages }` (Task 3).
- Produces: a tela `/dashboard/schedule` navegável por página.

Sem teste unitário: é orquestração de UI (estado, fetch, render). A verificação é o
Step 6.

- [ ] **Step 1: Import e estados novos**

Trocar `partitionByDay` por `orderDayGroups` no import de `@/lib/schedule`:

```ts
import {
  formatDuration,
  formatMinutes,
  groupByDate,
  localDayKey,
  orderDayGroups,
  summarizeDay,
  toMinutes,
} from "@/lib/schedule";
```

Acrescentar dois estados, logo depois de `listError`:

```ts
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
```

- [ ] **Step 2: `loadAvailabilities` manda `tab`/`page` e sincroniza a resposta**

Substituir:

```ts
  const loadAvailabilities = useCallback(() => {
    return fetchAdapter<{ availabilities: Availability[] }>({
      method: "GET",
      path: "/availabilities",
    })
      .then(({ data }) => {
        setAvailabilities(data.availabilities);
        setListError(null);
      })
      .catch((err) => {
        setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);
```

por:

```ts
  const loadAvailabilities = useCallback(() => {
    return fetchAdapter<{
      availabilities: Availability[];
      page: number;
      totalPages: number;
    }>({
      method: "GET",
      path: `/availabilities?tab=${tab}&page=${page}`,
    })
      .then(({ data }) => {
        setAvailabilities(data.availabilities);
        // O servidor clampa a página fora do intervalo válido (ex.: excluiu o
        // último horário da última página) — sincronizar em vez de confiar
        // no que foi pedido evita a tela ficar presa numa página inexistente.
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
  }, [tab, page]);
```

- [ ] **Step 3: Trocar de aba reseta a página**

Acrescentar, logo antes de `function openCreate() {`:

```ts
  function selectTab(next: "upcoming" | "past") {
    setTab(next);
    setPage(1);
  }
```

- [ ] **Step 4: As duas abas ficam sempre visíveis**

Substituir:

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
```

por (só troca `setTab` por `selectTab` e remove a condição `past.length > 0`, que não
existe mais como variável):

```tsx
      <div className="mt-6 inline-flex rounded-lg border bg-card p-0.5 text-sm">
        <button
          type="button"
          onClick={() => selectTab("upcoming")}
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
          onClick={() => selectTab("past")}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            tab === "past"
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Passados
        </button>
      </div>
```

- [ ] **Step 5: Trocar o recorte client-side pelo resultado já paginado**

Substituir:

```ts
  const todayKey = localDayKey(new Date());
  const { upcoming, past } = partitionByDay(availabilities, todayKey);
  // Passados do mais recente para o mais antigo: quem abre o histórico quer o
  // dia que acabou de passar, não o de meses atrás.
  const visible = tab === "past" ? [...past].reverse() : upcoming;
```

por:

```ts
  const todayKey = localDayKey(new Date());
  const dayGroups = orderDayGroups(groupByDate(availabilities), tab);
```

E, no JSX logo abaixo, trocar `visible.length === 0` pelo novo nome:

```tsx
        ) : visible.length === 0 ? (
```
```tsx
        ) : dayGroups.length === 0 ? (
```

E trocar `groupByDate(visible).map(([day, slots]) => {` por `dayGroups.map(([day, slots]) => {` — o corpo do `.map` (o card do dia, os horários, os botões de editar/excluir) não muda.

- [ ] **Step 6: Controles de página**

Acrescentar logo depois do `</div>` que fecha a lista de dias (`<div className="mt-6 flex flex-col gap-5">...</div>`) e antes do primeiro `<Dialog`:

```tsx
      {!loading && !listError && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Anterior
          </Button>
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
```

Criar, editar, excluir e gerar horários já chamam `loadAvailabilities()` depois de
salvar/excluir — como a função agora depende de `[tab, page]` via `useCallback`, isso
recarrega a mesma aba/página em que o colaborador está, sem nenhuma mudança adicional
nesses fluxos.

- [ ] **Step 7: Verificar**

```bash
cd web && npm run typecheck && npm run lint && npm run build && npm test
```

Expected: typecheck limpo; lint com os DOIS pré-existentes e nada novo; build compila;
62/62 (56 antigos + os 2 de `orderDayGroups` da Task 4, menos o 1 removido de
`partitionByDay` — conferir a contagem exata no output, não assumir).

Com API e web rodando, logado como o colaborador usado na Task 3 (mais de 7 dias de
horário cadastrado):

- A aba "Próximos" abre na página 1; o rodapé mostra "Página 1 de 3" (ou o total real) e
  "Anterior" vem desabilitado.
- Clicar "Próxima" troca os dias mostrados, sem repetir nem pular nenhum; "Anterior" volta
  ao estado inicial.
- Clicar "Passados" reseta para a página 1 dessa aba — mesmo tendo navegado pra página 3
  em Próximos.
- Se o colaborador não tiver nada em Passados, a aba aparece mesmo assim e mostra "Nenhum
  horário passado." (Decisão: as duas abas ficam sempre visíveis.)
- Excluir um horário na página atual atualiza a lista sem trocar de página; excluir o
  único horário restante da última página faz o rodapé refletir a página anterior (o
  servidor clampou).
- Criar um horário novo continua recarregando a aba/página atual (não pula
  automaticamente pra onde o horário caiu — decisão registrada no spec).
- Estreitar a janela abaixo de `sm`: os controles de página não quebram o layout nem
  geram scroll horizontal.

- [ ] **Step 8: Rodar a suíte inteira**

```bash
cd server && npm test && npm run typecheck
cd ../web && npm test && npm run typecheck && npm run lint && npm run build
```

Expected: server 96/96 (baseline; nenhum teste de servidor muda nesta task); web sem
regressão; nada novo no lint.

- [ ] **Step 9: Commit**

```bash
git add web/app/dashboard/schedule/page.tsx
git commit -m "feat(web): paginate the employee schedule by day"
```
