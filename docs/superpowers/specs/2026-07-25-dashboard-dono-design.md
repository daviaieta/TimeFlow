# Dashboard do dono do negócio — design

**Data:** 2026-07-25
**Branch:** `feat/work-schedule` (nova branch empilhada: `feat/owner-dashboard`)
**Contexto:** `/dashboard` é placeholder desde o começo — três cards com `—` e um bloco
"seu negócio está quase pronto". O ADMIN administra Serviços e Equipe mas não tem
nenhuma visão do movimento: não existe listagem de `Booking` para ele em lugar nenhum
do produto. Esta feature entrega a visão geral do dono com dados reais.

## Decisões

- **Escopo ADMIN apenas.** `EMPLOYEE` e `SUPERADMIN` continuam no placeholder atual. A
  versão do colaborador ("minha ocupação, minhas próximas reservas") reaproveita os
  mesmos componentes e fica de follow-up.
- **Um endpoint agregado** `GET /dashboard/overview?days=N` (contra reusar endpoints
  existentes, que não cobrem `Booking`, e contra endpoints granulares, que multiplicam
  round-trips e superfície de auth sem ganho nesta escala).
- **Janela olhando para frente**, seletor 7 / 30 / 90 dias. "Minha agenda está cheia?" é
  pergunta sobre o futuro, e a resposta é acionável: dá para abrir mais horário.
- **Gráficos sem dependência nova**, SVG e CSS grid à mão sobre os tokens
  `--chart-1..5` que já existem em `globals.css`. Os dados são simples demais para
  justificar Recharts.
- **Ocupação e receita são métricas distintas** (ver §1) — o dashboard não as mistura.
- **Tendência sai de `Booking.createdAt`**, não da ocupação (ver §1).

## 1. Semântica dos dados

Duas propriedades do schema atual moldam todo o resto.

**`isBooked` tem duas origens.** Um slot fica ocupado por reserva pública (existe linha
`Booking`, com `serviceId` e portanto preço) ou por **encaixe manual** do colaborador
(`Availability.clientName` preenchido, sem `Booking`, sem serviço, sem receita).
Portanto:

- Ocupação, contagem de horários e mapa de calor contam `isBooked`.
- Receita, ticket médio e mix de serviços contam apenas linhas de `Booking`.
- O tile de reservas mostra a quebra explícita: `N pelo site · M encaixes`.

**Comparação temporal.** Comparar "próximos 7 dias" com "últimos 7 dias" é enganoso: a
agenda futura ainda está enchendo, então o delta seria estruturalmente negativo. A
tendência do dashboard usa `Booking.createdAt` — "novas reservas nos últimos N dias vs.
os N dias anteriores" —, que compara dois períodos igualmente fechados.

**Convenção de data.** `Availability.date` é meia-noite UTC. A janela é calculada assim,
mesma convenção de `publicBookingService.getBusinessPage`:

```ts
const from = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
const to = new Date(from.getTime() + days * 86_400_000);
```

Dia da semana e hora derivam de `date` (UTC) e de `startTime` (`"HH:mm"`).

**Corte do passado dentro do dia de hoje.** Slots de hoje que já passaram continuam na
janela para efeito de ocupação (aconteceram), mas não entram em "próximas reservas" nem
nos alertas de vaga livre. Reuso de `isSlotUpcoming` de `publicBookingRules`.

## 2. `GET /dashboard/overview` — auth ADMIN

Querystring: `{ days: 7 | 30 | 90 }` (`enum`, default `7`, `additionalProperties: false`).

```ts
interface DashboardOverview {
  range: { days: number; from: string; to: string }; // "YYYY-MM-DD"

  kpis: {
    occupancy: { rate: number; booked: number; total: number };  // rate 0..1
    bookings: { total: number; online: number; manual: number };
    revenue: { scheduled: string; averageTicket: string };       // Decimal → string
    pace: { current: number; previous: number };                 // Booking.createdAt
  };

  occupancyByBucket: {
    key: string;        // "2026-07-25" (7d) ou "2026-07-20" início da semana (30/90d)
    label: string;      // "sex 25" | "20–26 jul"
    booked: number;
    free: number;
  }[];

  heatmap: {
    weekday: number;    // 0=dom … 6=sáb
    hour: number;       // 0..23
    booked: number;
    total: number;
  }[];                  // só células com total > 0

  team: {
    id: number;
    name: string;
    pendingInvite: boolean;
    slots: number;
    booked: number;
    rate: number;       // 0..1; 0 quando slots === 0
    revenue: string;
  }[];                  // ordenado por rate desc, sem-agenda por último

  services: {
    id: number;
    name: string;
    bookings: number;
    revenue: string;
    share: number;      // fração da receita da janela, 0..1
  }[];                  // ordenado por revenue desc

  upcoming: {
    availabilityId: number;
    date: string;       // "YYYY-MM-DD"
    startTime: string;
    endTime: string;
    clientName: string;
    clientPhone: string | null;   // null em encaixe manual
    serviceName: string | null;   // null em encaixe manual
    employeeName: string;
  }[];                  // as 8 próximas a partir de agora, ignora `days`

  alerts: {
    kind: "employee-no-slots" | "service-no-employee"
        | "day-fully-booked" | "pending-invite";
    label: string;      // texto pronto, montado no server
    count: number;
  }[];
}
```

`upcoming` ignora `days` de propósito: "o que vem agora" não é função do período
selecionado. Consequência de implementação em §4.

`revenue` e `averageTicket` viajam como string porque `Prisma.Decimal` serializa assim —
mesma convenção de `Service.price` em `web/lib/types.ts`.

## 3. Servidor

```
repositories/dashboardRepository.ts   queries da janela, select enxuto
services/dashboardRules.ts            agregação pura ← toda a lógica testável
services/dashboardRules.test.ts       node:test
services/dashboardService.ts          orquestra repo → rules
controllers/dashboardController.ts
routes/dashboardRoutes.ts             registrado em server.ts
```

### `dashboardRepository`

- `findAvailabilitiesInRange(businessId, from, to)` — `Availability` de todos os
  colaboradores do negócio no intervalo, com `select` enxuto:
  `id, date, startTime, endTime, isBooked, clientName, employeeId` +
  `booking: { clientName, clientPhone, service: { id, name, price } }`.
- `findUpcomingBooked(businessId, from, limit)` — os próximos slots ocupados a partir de
  hoje, `take: limit + margem`, mesmos campos. Query separada porque `upcoming` não
  respeita a janela.
- `countBookingsCreatedBetween(businessId, from, to)` — para `kpis.pace`, duas chamadas
  (janela atual e anterior). `count` no banco, não em memória.
- Equipe e serviços vêm de `employeeRepository.findManyByBusiness` e
  `serviceRepository.findManyByBusiness`, já existentes — inclusive para saber quem tem
  zero slots e quais serviços não têm profissional vinculado.

**Volume:** 90 dias × 10 colaboradores × 16 slots/dia ≈ 14k linhas com select enxuto.
Aceitável nesta escala. O caminho de otimização (`groupBy` no Prisma) fica aberto sem
tocar nas regras puras, porque a agregação está isolada.

### `dashboardRules` — funções puras

Cada uma recebe as linhas já carregadas e devolve um pedaço do DTO:

- `buildKpis(slots, paceCurrent, pacePrevious)` — ocupação, quebra online/manual
  (`slot.booking ? online : manual`), soma de `booking.service.price`, ticket médio
  (`scheduled / online`, `"0"` quando `online === 0`).
- `bucketOccupancy(slots, days, from)` — por dia quando `days === 7`, por semana quando
  30 ou 90. Dias sem nenhum slot aparecem zerados para a barra não mentir sobre a
  continuidade do eixo.
- `buildHeatmap(slots)` — agrupa por (`weekday`, `hour`) derivados de `date` UTC e
  `startTime`; emite só células com `total > 0`.
- `rankTeam(slots, employees)` — todo colaborador do negócio aparece, inclusive com zero
  slots (`rate: 0`). Ordena por `rate` desc; quem tem `slots === 0` vai para o fim
  independentemente do rate.
- `rankServices(slots, services)` — só serviços com pelo menos uma reserva na janela;
  `share` sobre a receita total da janela, `0` quando a receita é zero.
- `buildUpcoming(upcomingSlots, now, limit)` — recebe o resultado de
  `findUpcomingBooked` (não os slots da janela), filtra com `isSlotUpcoming`, ordena por
  (`date`, `startTime`), corta em `limit`. Encaixe manual entra com
  `serviceName: null` e `clientPhone: null`. A margem no `take` do repository existe
  porque slots de hoje já passados são descartados aqui, depois da query.
- `buildAlerts(slots, employees, services, from, days)` — os quatro `kind` do DTO, com
  `label` montado aqui (o client não remonta texto).

Divisão por zero é o caso de borda recorrente: ocupação, ticket médio e `share` todos
retornam `0` / `"0"` quando o denominador é zero, e cada um tem teste.

### Autorização

`preHandler: [authenticate, authorize(Role.ADMIN)]`. `businessId` via
`requireBusinessId`, como nas outras rotas de ADMIN — nenhum dado cruza negócio.

## 4. Web

```
lib/dashboard.ts              tipos do DTO + helpers puros de apresentação
lib/dashboard.test.ts         node --test lib/*.test.ts
components/dashboard/
  kpi-cards.tsx               4 tiles
  occupancy-chart.tsx         barras empilhadas
  occupancy-heatmap.tsx       grid dia-da-semana × hora
  team-panel.tsx              ranking com barra de ocupação
  services-panel.tsx          barras horizontais
  upcoming-bookings.tsx       lista operacional
  attention-panel.tsx         alertas
  period-selector.tsx         7 / 30 / 90
app/dashboard/page.tsx        fetch, estado, gate por role
```

Componentes pequenos e de responsabilidade única, contra o precedente de
`app/dashboard/schedule/page.tsx` (751 linhas). Cada componente recebe sua fatia do DTO
por prop e não busca dado próprio.

`lib/dashboard.ts` concentra o que é puro e testável: formatação de moeda e percentual,
escala de intensidade do heatmap (`rate` → índice de cor), rótulo relativo de data
(`Hoje` / `Amanhã` / `sex, 01 ago`), e agrupamento de `upcoming` por dia.

### Página

`page.tsx` faz o gate: `user.role !== "ADMIN"` renderiza o placeholder atual (extraído
para `components/dashboard/placeholder-overview.tsx`, sem mudança visual). ADMIN busca
`/dashboard/overview?days=${days}` via `fetchAdapter`.

Layout em grid de 12 colunas: KPIs em linha cheia; ocupação por dia (8 col) ao lado de
atenção (4 col); mapa de calor em linha cheia; equipe (7 col) e serviços (5 col);
próximas reservas em linha cheia. Empilha em uma coluna abaixo de `lg`.

### Estados

- **Carregando:** skeleton com a forma final do layout, não spinner — a estrutura já é
  conhecida e o salto de layout é o que faz dashboard parecer amador.
- **Trocar período:** mantém os dados anteriores visíveis com opacidade reduzida e
  `aria-busy`, sem desmontar. Nada pisca.
- **Erro:** card com a mensagem do `ApiError` e botão "Tentar de novo".
- **Vazio real:** negócio com zero slots criados na janela **e** zero reservas não
  mostra um dashboard de zeros — mostra um card de onboarding apontando para Equipe e
  Serviços. A condição é sobre o negócio estar vazio, não sobre a janela: um negócio
  ativo numa semana parada vê os zeros, que são informação legítima.

### Direção visual

Índigo do sistema como primária; `--chart-2..5` para categorias. Densidade maior que as
páginas atuais, números com `tabular-nums` e alinhados à direita nas comparações,
hierarquia por peso e tamanho em vez de caixas coloridas. O heatmap usa uma rampa de
opacidade da primária, não um gradiente multicolor. Trabalhar sob a skill
`frontend-design` na implementação.

## 5. Testes

**Servidor** (`dashboardRules.test.ts`, node:test): ocupação com denominador zero;
quebra online vs. encaixe manual; ticket médio sem reservas online; bucket diário vs.
semanal na virada 7→30; heatmap derivando weekday de data UTC; colaborador sem slots no
fim do ranking com `rate: 0`; `share` somando 1 com receita positiva e `0` com receita
zero; `upcoming` cortando slot de hoje que já passou; cada `kind` de alerta.

**Web** (`lib/dashboard.test.ts`): rótulo relativo de data nas bordas Hoje/Amanhã/outro;
escala de intensidade do heatmap nos extremos 0 e 1; formatação de moeda a partir da
string do Decimal; agrupamento de `upcoming` por dia preservando ordem.

**Ponta a ponta manual:** logar como ADMIN de um negócio com dados reais, conferir os
três períodos, e comparar a contagem de reservas com o que a agenda do colaborador
mostra.

## Fora de escopo

- Dashboard do colaborador e do SUPERADMIN.
- Exportar CSV / relatórios.
- Status de `Booking` (cancelado, no-show) — não existe no schema; "receita agendada"
  é a única leitura honesta hoje.
- Filtro por colaborador ou por serviço dentro do dashboard.
