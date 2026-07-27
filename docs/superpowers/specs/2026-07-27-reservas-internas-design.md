# Reservas internas (Fase 3) — design

## Contexto

Hoje só existe reserva pelo fluxo público (`publicBookingService.createBooking`): o
cliente escolhe funcionário, serviço e horário sozinho na página pública do negócio.

Um negócio real também precisa da atendente (na loja, com o cliente na frente)
criar a reserva pelo painel — cliente fala nome/telefone/email, atendente escolhe
o horário. Hoje isso é simulado com um workaround manual: o dono do horário edita
a `Availability` e escreve um `clientName` cru nela (`PUT /availabilities/:id`),
sem telefone, sem email, sem vínculo de serviço, sem suportar serviço que ocupa
vários slots seguidos. Essa fase substitui o workaround por reserva de verdade
(um `Booking` real), e remove o workaround.

## Fluxo

Atendente (ADMIN ou EMPLOYEE) abre `/dashboard/schedule`, escolhe o funcionário
num seletor, vê a agenda dele (mesmos slots livres/reservados de sempre). Num
slot livre, clica **Reservar**: escolhe o serviço dentre os que aquele
funcionário oferece, preenche nome/telefone/email(opcional) do cliente. O
servidor roda a mesma validação do booking público — slot ainda livre, serviço
oferecido pelo profissional, serviço cabe na sequência de slots a partir dali —
e cria o `Booking` real, na mesma tabela, pelo mesmo `bookingRepository.createWithClaim`.

Quem pode criar reserva pra quem: ADMIN e EMPLOYEE, ambos podem reservar pra
qualquer funcionário do próprio negócio (não só pra si mesmo).

Reserva interna só usa slots que já existem na grade (`Availability` já gerada
via "Gerar horários"). Não existe reserva em horário arbitrário fora da grade.

## Backend

### Schema: origem da reserva

O dashboard mostra hoje "X pelo site · Y encaixes" (`kpi-cards.tsx`), calculado
a partir de "tem `Booking` = online, não tem `Booking` = encaixe manual". Com o
encaixe manual removido, toda reserva vira um `Booking` de verdade — essa
distinção por presença de `Booking` deixa de existir. Pra manter o hint com
sentido, `Booking` ganha uma coluna `source` (`enum BookingSource { ONLINE INTERNAL }`):
`ONLINE` quando criado pelo fluxo público (`publicBookingService`), `INTERNAL`
quando criado pela Reserva Interna (`internalBookingService`). A coluna tem
`@default(ONLINE)` só pra migration rodar limpa em cima de reservas já
existentes (todas vieram do site); no código, os dois serviços sempre passam
o valor explicitamente — nenhum caminho de criação depende do default.

### Regras compartilhadas

`isSlotUpcoming`, `slotRunForDuration`, `slotsFittingDuration` saem de
`publicBookingRules.ts` para um módulo novo `bookingRules.ts` — são regra de
reserva, não regra "pública". `publicBookingRules.ts` fica só com o que é DTO da
página pública (`toPublicBusinessDto`, `toPublicSlotDto`, `buildBookingSummary`).

O núcleo de "cria a reserva" (achar serviço, achar slot, checar se o
profissional oferece o serviço, checar se ainda está livre e cabe, `createWithClaim`)
também sai de dentro de `publicBookingService.createBooking` para uma função
compartilhada em `bookingService.ts`, usada tanto pelo fluxo público quanto pelo
interno. Público e interno só diferem em como resolvem o `businessId` (por slug
vs. por `req.user.businessId`) e no formato da resposta.

### Rota nova: `POST /bookings`

Arquivo novo `bookingRoutes.ts` (mesmo padrão de separação já usado entre
`publicRoutes.ts` e as rotas autenticadas).

- `preHandler: [authenticate, requireActiveSubscription, authorize(Role.ADMIN, Role.EMPLOYEE)]`
- Body: `{ employeeId, serviceId, availabilityId, clientName, clientPhone, clientEmail? }`
- `internalBookingService.createBooking(actor, input, now)` valida que
  `employeeId` pertence ao mesmo `businessId` do ator (403 se não), chama o
  núcleo compartilhado de `bookingService.ts`, devolve um DTO simples (sem o
  resumo com nome do negócio que o público usa).

### `GET /availabilities`

- `authorize` ganha `Role.ADMIN` (hoje só `Role.EMPLOYEE`).
- Querystring ganha `employeeId` opcional: ADMIN precisa informar (não tem
  agenda própria); EMPLOYEE sem informar cai na própria agenda.
- Sempre valida que o `employeeId` pedido é do mesmo negócio de quem está
  logado (403 caso contrário).

## Limpeza do encaixe manual

- Remove o botão "Novo horário" e o endpoint `POST /availabilities` inteiro
  (controller, service, schema, teste).
- Remove `clientName` do schema do `PUT /availabilities/:id`, de
  `AvailabilityInput`/`AvailabilityData`/`buildAvailabilityData` — o dialog de
  editar fica só com data/início/fim.
- Simplifica `toAvailabilityDto`: `clientName` só vem de `booking?.clientName`.
  O campo `locked` é removido do DTO e do tipo `Availability` do front — não
  existe mais "ocupado sem Booking", então `isBooked` sozinho já diz tudo que
  `locked` dizia.
- Remove os testes que cobrem o encaixe manual em `availabilityRules.test.ts`.

## Dashboard (`dashboardRules.ts`)

- O hint "X pelo site · Y encaixes" muda pra "X pelo site · Y por atendente",
  lido a partir de `Booking.source` em vez de "tem Booking ou não".
- `rankServices` e a receita de `rankTeam`/`buildKpis` hoje ignoram encaixe
  manual (sem `Booking`, sem `serviceId`, não entram no ranking por serviço).
  Reserva interna tem `Booking` e `serviceId` reais — passa a contar em
  receita e ranking de serviço normalmente, os dois canais juntos. É a
  correção esperada: um corte feito por encaixe interno é receita real do
  negócio, só não existe hoje porque o encaixe manual nunca teve serviço
  associado.
- `buildUpcoming`: `row.clientName` (encaixe manual) deixa de ser fallback de
  nome — toda linha reservada tem `booking.clientName`.

## Frontend (`/dashboard/schedule`)

- Seletor de funcionário no topo, populado por `GET /employees`. ADMIN escolhe
  obrigatoriamente antes de ver qualquer agenda; EMPLOYEE já entra na própria,
  mas pode trocar pra de um colega.
- "Gerar horários" e os ícones de editar/excluir só aparecem quando a agenda
  em exibição é a do próprio usuário logado. Vendo a agenda de outra pessoa, só
  aparece o botão **Reservar** nos slots livres.
- "Novo horário" some de vez, pra todo mundo.
- Dialog novo "Reservar": `availabilityId` e `employeeId` já fixos pelo slot
  clicado; select de serviço filtrado aos que aquele funcionário oferece
  (mesmo `GET /employees` já traz `services` por funcionário); campos
  `clientName`, `clientPhone`, `clientEmail` (opcional); submit chama
  `POST /bookings`.
- Slot ocupado sempre mostra badge "Reservado" — acabou a distinção visual
  entre encaixe manual e reserva real, porque não existe mais encaixe manual.

## Erros e validação

- Reaproveita os mesmos `ConflictError` do fluxo público: slot ocupado, serviço
  não oferecido pelo profissional, serviço não cabe na duração a partir do
  slot escolhido.
- Novo: 403 se o `employeeId` pedido (em `GET /availabilities?employeeId=` ou
  em `POST /bookings`) não pertence ao mesmo `businessId` de quem está logado.
- `clientPhone` obrigatório, `clientEmail` opcional — mesmo schema já usado no
  booking público (`minLength`/`maxLength` iguais).

## Testes

- `publicBookingRules.test.ts` vira `bookingRules.test.ts` (mesmo conteúdo,
  módulo renomeado).
- `internalBookingService.test.ts` novo: mesmos casos do público (slot
  ocupado, serviço não oferecido, não cabe) + caso de cross-business bloqueado.
- Atualiza `availabilityService.test.ts`: remove os casos de encaixe manual,
  cobre `employeeId` de querystring e ADMIN vendo agenda alheia.
- Teste de rota novo para `POST /bookings` (401/403 por role errado e por
  `employeeId` de outro negócio).

## Fora de escopo (YAGNI, por decisão explícita)

- Reserva em horário fora da grade (sem `Availability` pré-gerada).
- Cancelar ou remarcar reserva (já fora do MVP, decisão anterior).
- Qualquer tela nova separada de "nova reserva" — o fluxo vive dentro da
  agenda existente.
