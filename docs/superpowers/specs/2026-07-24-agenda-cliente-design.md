# Agenda do colaborador: encaixe manual e linha do tempo — design

**Data:** 2026-07-24
**Branch:** a definir na implementação
**Contexto:** a página `/dashboard/schedule` lista horários como uma lista plana de
intervalos (`09:00 – 10:00`) sem nenhuma informação além do badge "Reservado" — que na
prática nunca aparece. O nome do negócio no topo do dashboard é renderizado com o mesmo
peso tipográfico do resto e está ausente da agenda.

## Achado que motivou o escopo

O schema já tem o model `Booking` completo (`clientName`, `clientPhone`, `clientEmail`,
`serviceId`), **mas nenhum código cria bookings** — não existe `bookingRoutes`,
`bookingService` nem `bookingRepository`. Logo `Availability.isBooked` é sempre `false` e
o badge "Reservado" em `schedule/page.tsx:216` é código morto hoje.

Isso explica a queixa de "muito sem informação": os dados mais ricos do domínio não têm
caminho até o banco. Em vez de construir o fluxo completo de reserva (fora de escopo),
esta feature dá ao colaborador a marcação manual — o caso real de barbearia, onde o
profissional já sabe quem vem e anota na hora de abrir o horário.

## 1. Dados: `clientName` na Availability

Migration adicionando coluna nula:

```prisma
model Availability {
  // ...
  clientName String?
}
```

**Regra:** `clientName` preenchido ⇒ `isBooked = true`. Limpar o campo ⇒ `isBooked =
false`. O service aplica `trim()` e converte string vazia/só-espaços em `null`, para não
existir slot marcado como ocupado sem ninguém associado.

O campo entra em `availabilityBodySchema` como opcional. O schema tem
`additionalProperties: false`, então precisa ser declarado explicitamente:

```ts
clientName: { type: ["string", "null"], maxLength: 80 },
```

`null` é aceito para permitir que o PUT limpe o encaixe. Sem isso não haveria como
desmarcar um cliente pela UI.

## 2. A trava de edição muda de critério

Esta é a mudança de comportamento mais sensível da feature.

Hoje `availabilityService.ts:56` e `:68` bloqueiam edição e exclusão por `isBooked`:

```ts
if (availability.isBooked) throw new ConflictError(...)
```

Se mantivéssemos isso, preencher o nome do cliente marcaria `isBooked = true` e o
colaborador **perderia o acesso ao próprio encaixe** — digitou o nome errado, não
consegue mais corrigir nem excluir, sem saída pela UI.

A trava passa a checar a existência de um `Booking` real:

```ts
async function findOwnedAvailability(employeeId, id) {
  const availability = await availabilityRepository.findById(id); // include: { booking: true }
  if (!availability || availability.employeeId !== employeeId) {
    throw new NotFoundError("Availability not found");
  }
  return availability;
}

// em update e delete:
if (availability.booking) {
  throw new ConflictError("This time slot is booked and cannot be changed");
}
```

Resultado: encaixe manual (nome sem `Booking`) é editável e excluível pelo dono; reserva
feita por cliente externo continua travada. Quando o fluxo de `Booking` existir, a trava
já estará correta sem novas mudanças.

`availabilityRepository.findById` passa a usar `include: { booking: true }`.

## 3. Contrato da API

`listAvailabilities` passa a devolver um DTO explícito em vez do registro cru do Prisma:

```ts
{
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
  locked: boolean;   // booking !== null
}
```

`locked` é derivado no service. O front precisa dele para decidir se mostra os botões de
editar/excluir — sem isso a UI ofereceria ações que o backend recusaria com 409.

`findManyByEmployee` ganha `include: { booking: { select: { id: true } } }`.

## 4. Agenda: linha do tempo

Layout escolhido entre três alternativas (lista com status e grade semanal foram as
descartadas). Estrutura por dia:

- **Cabeçalho do dia:** data por extenso + contadores (`2 ocupados · 2 livres · 4h`).
  O dia corrente recebe prefixo `HOJE ·`.
- **Trilho de horas** à esquerda, cada horário como bloco à direita.
- **Bloco ocupado:** barra indigo à esquerda, nome do cliente em destaque, intervalo e
  duração calculada abaixo.
- **Bloco livre:** borda tracejada, rótulo "Livre" esmaecido.
- **Vazios:** entre horários não consecutivos, uma linha `··· 3h sem horários
  cadastrados`. É o principal ganho de informação — hoje a tela não tem nenhuma noção de
  intervalo livre.

**Recorte temporal:** abas *Próximos* / *Passados*, com *Próximos* por padrão
(`date >= hoje`). Filtro puro no front, sem mudança de API. Hoje a lista abre no horário
mais antigo já cadastrado, o que faz a agenda parecer desatualizada.

**Formulário:** o dialog de criar/editar ganha o campo `Cliente` (opcional), com o texto
de apoio "deixe vazio para horário livre".

**Estados vazios:** sem horários futuros, mensagem convidando a criar o primeiro; a aba
*Passados* só aparece quando existem horários passados.

## 5. Nome da empresa

Nova função pura `web/lib/formatBusinessName.ts`:

```ts
export function formatBusinessName(name: string): string
```

Title-caseia **apenas quando o nome parece slug** — tudo minúsculo e contendo hífen ou
underscore. `old-brothers` → `Old Brothers`; `Barbearia Teste` passa intacto; uma marca
propositalmente minúscula sem hífen (`adidas`) também passa intacta.

A ressalva registrada: isso exibe algo diferente do que está gravado no banco. A correção
na origem (permitir o admin editar o nome) foi avaliada e adiada — ver Follow-ups.

Aplicação em dois pontos:

- **`web/app/dashboard/layout.tsx:134-137`** — header com monograma (iniciais em
  quadrado com gradiente), nome com peso maior e o papel do usuário abaixo.
- **`web/app/dashboard/schedule/page.tsx`** — nome como sobrelinha (eyebrow) acima do
  `<h1>Agenda</h1>`.

## 6. Testes

**Servidor** (`node --test`, já configurado):

- `clientName` preenchido marca `isBooked = true`
- `clientName` vazio/só-espaços vira `null` e não marca como ocupado
- limpar `clientName` no update devolve `isBooked = false`
- encaixe manual (sem `Booking`) permanece editável e excluível
- slot com `Booking` real recusa update e delete com 409

**Web:** o `web/` hoje só tem `eslint`. Será adicionado `node --test` via `tsx` para
funções puras, cobrindo `formatBusinessName`: slug com hífen, nome já capitalizado,
minúsculo sem hífen, string de uma palavra, underscore.

Seguindo TDD: teste escrito e falhando antes da implementação.

## Follow-ups (fora de escopo)

- `PUT /businesses/:id` para o admin editar o nome do negócio na origem — resolveria
  `old-brothers` de verdade, sem transformação na renderização.
- Fluxo real de `Booking` (rota, service, repository) e a tela pública de reserva.
- Exibir o serviço associado no bloco da agenda — depende do fluxo de `Booking`.
