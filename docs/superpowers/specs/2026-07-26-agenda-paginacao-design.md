# Paginação da agenda do colaborador — design

**Data:** 2026-07-26

## Problema

`GET /availabilities` devolve todos os horários do colaborador numa resposta só. O front
agrupa por dia e separa em abas Próximos/Passados client-side (`partitionByDay`). Com
"Gerar horários" criando até 62 dias de uma vez (vários slots por dia), essa lista cresce
rápido e o servidor passa a mandar — e o cliente a guardar em memória e renderizar —
centenas de linhas numa única resposta, sem necessidade: o colaborador só olha uma janela
de dias por vez.

## Decisões

### Paginar por dia, não por linha

Cada página traz um número fixo de **dias com horário cadastrado**, com todos os slots
desses dias. A alternativa — `LIMIT`/`OFFSET` direto na tabela `Availability` — é uma
query só, mas corta um dia ao meio se ele cair na fronteira da página: o resumo "X
ocupados · Y livres" do card e o efeito visual de intervalo entre horários passam a
mentir sobre o dia que está incompleto na tela. Paginar por dia custa uma query extra
(a lista de datas distintas da página) e evita esse problema pela raiz.

Tamanho de página fixo em **7 dias**, não configurável pelo cliente — decisão tomada em
conversa: cobre bem tanto quem cadastra semana a semana quanto quem gera um mês inteiro de
uma vez, sem abrir a porta pra um cliente pedir uma página gigante.

### Navegação por botões Anterior/Próxima, não scroll infinito

Decisão tomada em conversa: menos estado pra manter na tela (uma página por vez, não uma
lista que só cresce) e mais previsível pra depurar.

### O servidor é quem manda no número da página

O cliente pede uma página; o servidor devolve o número de página **real**, clampado entre
1 e o total. Isso cobre o caso de excluir o último horário da última página: em vez do
cliente ter que adivinhar que precisa voltar uma página, ele só re-sincroniza com o que
veio na resposta.

### As duas abas ficam sempre visíveis

Hoje a aba "Passados" só aparece se `past.length > 0` — decisão possível porque a lista
inteira já estava carregada no cliente. Sem carregar tudo de antemão, saber se existe
*algum* horário passado exigiria uma chamada só para essa checagem. Mais simples: as duas
abas (Próximos, Passados) ficam sempre visíveis; a aba sem dado nenhum mostra o estado
vazio que já existe hoje ("Nenhum horário passado.").

### Ações de escrita recarregam a página/aba atual, sem pular

Criar, editar, excluir ou gerar horários recarrega a mesma janela que o colaborador está
olhando. Um horário criado fora da página atual (ex.: colaborador na página 3 cria um
horário que cai na página 1) não aparece até ele navegar até lá — é uma perda de feedback
imediato, mas pular de página sozinho é mais surpreendente do que isso, e a alternativa
(descobrir em qual aba/página o novo horário caiu e pular pra lá) é complexidade que não
paga o benefício aqui. "Gerar horários" já mostra quantos foram criados no próprio dialog
de resultado, então a confirmação não depende de ver a linha na lista.

### Corrigido de brinde: ordem dos horários dentro do dia na aba Passados

Bug existente: a aba Passados hoje inverte a lista **inteira** antes de agrupar por dia
(`[...past].reverse()`), o que também inverte a ordem dos horários **dentro** de cada dia
— ficam decrescentes, quando deveriam continuar crescentes (só a ordem dos *dias* deveria
inverter, não a dos horários dentro do dia). Corrigido como parte desta entrega porque é a
mesma função que está sendo substituída pela paginação; sair sem consertar deixaria o bug
migrar pro código novo.

## Endpoints

### `GET /availabilities?tab=upcoming|past&page=N`

`preHandler: [authenticate, authorize(Role.EMPLOYEE)]`, igual à rota atual.

Querystring, ambos opcionais: `tab` (default `upcoming`), `page` (inteiro ≥ 1, default 1).
`additionalProperties: false`.

"Hoje" é o dia UTC do relógio do servidor no momento da chamada, mesma convenção que
`generateAvailabilities` já usa para compor `Date` a partir de string (`YYYY-MM-DDT00:00:00.000Z`)
— sem isso, comparar o `date` armazenado (meia-noite UTC) contra o relógio local do
servidor daria resultado errado perto da virada do dia.

`upcoming`: dias com `date >= hoje`, ordenados crescente — página 1 é a mais próxima de
hoje. `past`: dias com `date < hoje`, ordenados decrescente — página 1 é o dia passado mais
recente.

```jsonc
// resposta
{
  "availabilities": [ /* Availability[], já no formato de hoje */ ],
  "page": 1,
  "totalPages": 3
}
```

Sem dado nenhum na aba: `{ "availabilities": [], "page": 1, "totalPages": 1 }` — o front
não precisa tratar "zero páginas" como caso especial, só desenhar o estado vazio quando
`availabilities` vier vazio.

| Situação | Status |
| --- | --- |
| OK | 200 |
| `tab` fora de `upcoming`/`past`, ou `page` não é inteiro ≥ 1 | 400 (schema) |

## Back-end

- `server/src/services/availabilityRules.ts` ganha três funções puras:
  - `utcMidnight(date: Date): Date` — meia-noite UTC do dia de `date`.
  - `totalPagesFor(totalDays: number, pageSize: number): number` — `Math.max(1, Math.ceil(...))`.
  - `clampPage(page: number, totalPages: number): number`.
- `server/src/repositories/availabilityRepository.ts` ganha:
  - `countDates(employeeId, direction: "upcoming" | "past", todayStart: Date): Promise<number>`
    — via `groupBy(["date"])` filtrando `gte`/`lt` conforme a direção.
  - `findDatesPage(employeeId, direction, todayStart, skip, take): Promise<{ date: Date }[]>`
    — `distinct: ["date"]`, `orderBy: { date: direction === "upcoming" ? "asc" : "desc" }`.
  - `findManyByEmployeeForDates(employeeId, dates: Date[])` — `date: { in: dates }`,
    `orderBy: [{ date: "asc" }, { startTime: "asc" }]` (sempre crescente; quem inverte a
    ordem dos dias pro modo Passados é o front, na exibição).
- `availabilityService.listAvailabilities(employeeId, { tab, page }, now)` orquestra:
  conta os dias, calcula `totalPages`, clampa `page`, busca a página de datas, busca os
  slots dessas datas (pula a segunda query se a página de datas vier vazia), devolve o DTO.
- `availabilityController.listAvailabilities` lê `tab`/`page` da querystring (com
  default), passa `new Date()` como `now`.
- `availabilityRoutes.ts`: schema de querystring na rota GET.

## Front-end

- `web/app/dashboard/schedule/page.tsx`:
  - Estados novos: `page`, `totalPages`. Trocar de aba reseta `page` para 1.
  - `loadAvailabilities` passa a depender de `[tab, page]` e chamar
    `/availabilities?tab=${tab}&page=${page}`; a resposta atualiza `availabilities`, `page`
    (valor clampado do servidor) e `totalPages`.
  - Removida a lógica de `partitionByDay` e o `visible` derivado dela — `availabilities` já
    vem filtrado e paginado pelo servidor.
  - A aba Passados deixa de checar `past.length > 0`: os dois botões (Próximos/Passados)
    ficam sempre visíveis.
  - Controles "Anterior" / "Página X de Y" / "Próxima" abaixo da lista de dias, desabilitando
    nas pontas (`page === 1`, `page === totalPages`); escondidos quando `totalPages <= 1`.
  - Criar, editar, excluir e gerar horários chamam `loadAvailabilities()` (mesma
    aba/página), sem resetar `page`.
- `web/lib/schedule.ts`:
  - Remove `partitionByDay`.
  - Nova função pura `orderDayGroups(groups, tab)`: devolve os grupos como vieram para
    `upcoming`, invertidos (só a ordem dos grupos, não os horários dentro de cada um) para
    `past`.
- `web/lib/schedule.test.ts`: remove o teste de `partitionByDay`; adiciona teste de
  `orderDayGroups` cobrindo especificamente o bug corrigido (horários dentro do dia
  continuam crescentes depois de inverter a ordem dos dias).
- `web/lib/types.ts` ou o próprio `page.tsx`: tipo de resposta
  `{ availabilities: Availability[]; page: number; totalPages: number }`.

## Testes

Regras puras, `node:test`, teste antes da implementação:

- `utcMidnight`: meia-noite UTC de uma data com hora não-zero; datas já em meia-noite não
  mudam.
- `totalPagesFor`: divide exato, resto, zero dias (devolve 1, não 0).
- `clampPage`: abaixo de 1 vira 1; acima do total vira o total; dentro do range não muda.
- `orderDayGroups`: `upcoming` preserva a ordem recebida; `past` inverte a ordem dos
  grupos mas mantém cada `Availability[]` interno na mesma ordem (crescente) em que
  chegou — é o teste que prova o bug corrigido.

Verificação por curl, com um colaborador que tenha mais de 7 dias de horários cadastrados
(usar "Gerar horários" para popular): página 1 e 2 de `upcoming` não repetem nem pulam
dia; `totalPages` bate com a contagem manual de dias distintos; pedir uma página além do
total devolve a última válida; `tab`/`page` inválidos devolvem 400.

## Fora de escopo

Tamanho de página configurável · scroll infinito · pré-carregar a próxima página
antecipadamente · cache de páginas já visitadas no cliente (voltar para "Anterior" refaz a
requisição) · paginação em qualquer outra lista do sistema (Serviços, Equipe, painel do
superadmin) — só a agenda do colaborador tem o padrão de crescimento (geração em lote) que
justifica isso hoje.
