# Fluxo público de agendamento — design

**Data:** 2026-07-24
**Branch:** `feat/public-booking` (empilhado sobre `feat/agenda-cliente`, que criou
`clientName`/`locked` na Availability)
**Contexto:** o cliente final ainda não tem como marcar horário — o model `Booking`
existe no schema (`clientName`, `clientPhone`, `clientEmail`, `serviceId`,
`availabilityId @unique`) mas nenhuma rota, service ou página o utiliza. Toda rota do
servidor exige `authenticate`; esta feature cria a primeira superfície pública. A
landing page já promete exatamente isso ("Página pública por negócio", "o cliente não
precisa criar conta", "Dois clientes nunca reservam o mesmo horário").

## Decisões de produto

- **O slot é a unidade de reserva.** Cliente escolheu, ocupou o horário inteiro — a
  duração do serviço é informativa e não fatia o slot. Quem quer granularidade abre
  horários menores (ex.: de 30 em 30min). Zero mudança de schema.
- **Fluxo: serviço → profissional → horário → dados.** A etapa de profissional lista só
  quem oferece o serviço escolhido (vínculo `EmployeeService`) e é **pulada
  automaticamente quando há um só**.
- **Estrutura: assistente passo a passo** (uma decisão por tela, barra de progresso,
  botão Voltar, dock de resumo persistente). Escolhido em mockup contra "página única
  progressiva" e "calendário protagonista".
- **Sem conta, sem login.** Nome + WhatsApp obrigatórios, e-mail opcional.
- **Mobile-first**, herdando o tema do produto (indigo, shadcn/ui, dark mode).

## 1. API pública (servidor)

Novos arquivos seguindo o padrão route → controller → service → repository:
`publicRoutes.ts`, `publicController.ts`, `publicBookingService.ts`,
`publicBookingRules.ts` (funções puras), `bookingRepository.ts`. Rotas registradas em
`server.ts` **sem `authenticate`** — arquivo separado para o limite público ficar
visível.

### `GET /public/businesses/:slug`

Uma chamada agregada (evita cascata de requests no celular):

```ts
{
  business: { name: string; slug: string };
  services: {
    id: number; name: string; duration: number; price: string;
    employees: { id: number; name: string }[];   // quem oferece este serviço
  }[];
}
```

Serviços sem nenhum profissional vinculado **não aparecem** — o cliente não pode chegar
a um beco sem saída. 404 se o slug não existe.

### `GET /public/businesses/:slug/employees/:employeeId/slots`

Slots **livres e futuros** do profissional:

- `isBooked: false` (encaixes manuais têm `isBooked: true` e saem naturalmente);
- `date >= hoje`; para o dia de hoje, apenas `startTime` ainda à frente (relógio do
  servidor — aceitável enquanto o produto opera num único fuso);
- escopado pelo slug: o employee precisa pertencer ao negócio do slug (404 caso
  contrário), impedindo enumerar profissionais de outros negócios.

```ts
{ slots: { id: number; date: string; startTime: string; endTime: string }[] }
```

### `POST /public/businesses/:slug/bookings`

Body (schema com `additionalProperties: false`, como todo o projeto):

```ts
{
  availabilityId: number;
  serviceId: number;
  clientName: string;      // 1..80
  clientPhone: string;     // 8..20
  clientEmail?: string;    // format: email, opcional
}
```

Validação em cadeia, cada elo com seu erro:

1. slug existe → senão 404
2. serviço pertence ao negócio → senão 404
3. availability existe e seu employee pertence ao negócio → senão 404
4. o employee do slot oferece o serviço (`EmployeeService`) → senão 409
5. slot no futuro → senão 409
6. slot livre → senão 409 (ver concorrência)

Resposta 201 com o resumo da reserva (negócio, serviço, profissional, dia, horário,
nome do cliente) — é o que a tela de sucesso mostra.

## 2. Concorrência

Duas camadas:

1. **Claim atômico** dentro de `prisma.$transaction`:
   `updateMany({ where: { id, isBooked: false }, data: { isBooked: true } })` — se
   `count === 0`, outro cliente levou o horário → `ConflictError` ("Este horário acabou
   de ser reservado"). Só então o `Booking` é criado.
2. **Backstop no banco:** `Booking.availabilityId @unique` — se a lógica falhar, o
   Postgres recusa o segundo booking e o `errorHandler` já mapeia P2002 → 409.

Efeito colateral desejado da base existente: slot com `Booking` real fica `locked` no
DTO do colaborador, que não consegue editar/excluir o horário de um cliente.

## 3. Páginas (web)

### Rota

`web/app/[slug]/page.tsx` — ex.: `timeflow.com/old-brothers`. Rotas estáticas
(`/login`, `/dashboard`, `/accept-invite`) têm precedência sobre a dinâmica no Next;
reservar slugs proibidos fica de follow-up. Slug inexistente → `notFound()` do Next.

### Wizard (client-side, estado em memória)

Recarregar a página recomeça o fluxo — aceitável para um fluxo de ~1 minuto; sem
estado na URL (YAGNI).

- **Passo 1 · Serviço** — cards com nome, duração formatada (`formatMinutes`, reuso) e
  preço em R$.
- **Passo 2 · Profissional** — cards de quem oferece o serviço; pulado se houver um só
  (a barra de progresso mostra o passo como concluído, e Voltar a partir do passo 3
  retorna ao passo 1 nesse caso).
- **Passo 3 · Horário** — chips de dia (dias com slot livre) + grade de horários do dia
  selecionado; busca os slots ao entrar no passo.
- **Passo 4 · Seus dados** — nome, WhatsApp (input `tel`, validação mínima de tamanho),
  e-mail opcional; botão **Confirmar** com resumo no rótulo.
- **Sucesso** — tela final com todos os detalhes da reserva e aviso "guarde estes
  dados" (não há conta nem link de gestão).

Persistentes em todos os passos: monograma + `formatBusinessName` (reuso de
`web/lib/businessName.ts`), "Passo X de 4", barra de progresso, Voltar, dock de resumo
das escolhas.

### Erros com recuperação

- 409 no confirmar → mensagem "esse horário acabou de ser reservado", volta ao passo 3
  e recarrega os slots.
- Falha de rede/validação → mensagem inline no passo atual, sem perder as escolhas.

### Helpers puros novos (`web/lib/publicBooking.ts`)

- agrupar slots por dia e montar os chips (reusa `groupByDate`-like sobre o shape
  público);
- rótulos de dia ("HOJE", "sex 25") a partir do ISO;
- `isValidPhone` (mínimo de dígitos após remover máscara);
- formatação de preço (`Decimal` serializado como string → "R$ 50,00").

## 4. Testes

Padrão da feature anterior — decisão em módulo puro, integração via curl:

- **Servidor** (`publicBookingRules.test.ts`): filtro de slots futuros (inclui o corte
  por hora no dia de hoje), montagem do payload agregado (serviço sem profissional é
  omitido), validação da cadeia (cada 404/409 com um caso).
- **Web** (`publicBooking.test.ts`, `node --test` nativo): agrupamento/chips, rótulos
  de dia, telefone, preço.
- **Concorrência de verdade:** dois POSTs simultâneos no mesmo slot via curl — um 201 e
  um 409, verificado no banco (1 Booking).

## Fora de escopo (follow-ups)

- Pagamento online; cancelamento/reagendamento pelo cliente; notificações e-mail/SMS.
- Rate-limiting anti-spam nas rotas públicas.
- Slugs reservados (`login`, `dashboard`, …) na criação de Business.
- Branding do negócio (logo, cores) — a página usa monograma + nome formatado.
