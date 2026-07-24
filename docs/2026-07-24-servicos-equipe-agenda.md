# Serviços, Equipe e Agenda — adapter, CRUDs e decisões de design

**Data:** 2026-07-24
**Branch:** `feat/services-team-schedule`
**Spec de referência:** `docs/superpowers/specs/2026-07-24-services-team-schedule-design.md`

Este documento explica o que foi construído nesta etapa e, principalmente, *por que* cada
peça foi desenhada do jeito que foi. É um documento de estudo de arquitetura, não um
changelog — o objetivo é entender os padrões o suficiente para reaplicá-los em outro
contexto.

---

## 1. O que foi construído

Três páginas novas no dashboard, três CRUDs novos no backend, e um adapter central de
chamadas HTTP no frontend substituindo o `lib/api.ts` anterior.

**Frontend — `web/app/dashboard/`:**

- `services/page.tsx` — tabela de serviços (nome, duração, preço em BRL). ADMIN cria,
  edita e exclui via dialog; EMPLOYEE só visualiza.
- `team/page.tsx` — lista de colaboradores com badge de status de convite
  ("Convite pendente" / "Ativo") e os serviços vinculados a cada um. ADMIN convida,
  vincula serviço via `<Select>` e remove; EMPLOYEE só visualiza.
- `schedule/page.tsx` — agenda pessoal do EMPLOYEE, agrupada por dia. Cria, edita e
  exclui horários livres; horários com `isBooked = true` aparecem com badge "Reservado"
  e sem ações. ADMIN e SUPERADMIN veem uma mensagem informativa no lugar da lista.
- `app/dashboard/layout.tsx` — a sidebar agora filtra os itens de navegação por `role`
  (array `navItems`, cada item com `roles: Role[]`): Serviços e Equipe para
  ADMIN/EMPLOYEE, Agenda só para EMPLOYEE, SUPERADMIN não vê nenhum dos três porque não
  tem `business` associado.
- `web/lib/types.ts` — tipos `Service`, `Employee`, `EmployeeServiceLink` e
  `Availability` compartilhados entre as três páginas, espelhando exatamente o formato
  de resposta dos controllers (`{ services }`, `{ employees }`, `{ availabilities }`).

**Backend — `server/src/`:**

- Fase 3.2 — Services: `routes/serviceRoutes.ts`, `controllers/serviceController.ts`,
  `services/serviceService.ts`, `repositories/serviceRepository.ts`.
- Fase 3.3 — Employees: `routes/employeeRoutes.ts`,
  `controllers/employeeController.ts`, `services/employeeService.ts`,
  `repositories/employeeRepository.ts`.
- Fase 3.4 — Availabilities: `routes/availabilityRoutes.ts`,
  `controllers/availabilityController.ts`, `services/availabilityService.ts`,
  `repositories/availabilityRepository.ts`.

**Adapter — `web/adapters/fetchAdapter.ts`**, descrito em detalhe na seção 2.

---

## 2. O padrão adapter no frontend

### Por que centralizar as chamadas HTTP

Antes desta etapa, `web/lib/api.ts` expunha uma função por verbo (`apiGet`, `apiPost`),
cada uma repetindo a montagem da URL, dos headers e do parsing de erro. Cada nova rota
(`PUT`, `DELETE`) exigiria uma nova função. Isso é o sintoma de um problema maior:
**não existia um único lugar responsável por "como conversar com a API"** — baseURL,
injeção de token, formato de erro e serialização de body estavam espalhados pelo
arquivo e, na prática, replicados de cabeça toda vez que alguém chamava `fetch`
diretamente em outro componente.

Um adapter resolve isso invertendo a pergunta: em vez de "que função eu chamo para fazer
um GET", a pergunta vira "que requisição eu quero fazer" — método, caminho, corpo e
headers viram *dados* passados para uma única função, e tudo que é transversal (token,
baseURL, tratamento de erro) fica implementado uma única vez, testável e alterável em
um só lugar. Se amanhã o projeto trocar de convenção de erro da API, ou passar a exigir
um header extra em toda chamada, a mudança acontece em um arquivo, não em N
componentes.

### Anatomia do `fetchAdapter`

```ts
// web/adapters/fetchAdapter.ts
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const fetchAdapter = async <T = unknown>({
  method, path, body, headers,
}: FetchAdapterInput): Promise<{ data: T; status: number; statusText: string }> => {
  const token = typeof window === "undefined" ? null : getToken();

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as T;

  if (!res.ok) {
    const message = (data as { message?: string }).message ?? "Erro inesperado. Tente novamente.";
    throw new ApiError(message, res.status);
  }

  return { data, status: res.status, statusText: res.statusText };
};
```

Pontos importantes da assinatura:

- **Um único parâmetro, um objeto de configuração** (`{ method, path, body, headers }`),
  não um parâmetro por posição. Isso escala para novos campos (ex.: `signal` para
  cancelamento) sem quebrar quem já chama o adapter, e deixa cada call site
  autoexplicativo no ponto de uso — não é preciso saber a ordem dos argumentos.
- **Token automático:** o adapter lê o token via `getToken()` (`web/lib/auth.ts`, que só
  encapsula `localStorage`) e injeta `Authorization: Bearer <token>` sempre que existir,
  sem que o componente precise saber que o token existe ou onde ele mora. O parâmetro
  `headers` permite sobrescrever/complementar quando necessário (nenhum consumidor atual
  precisa disso, mas a porta fica aberta).
- **`ApiError` mora no adapter,** não em `lib/`, porque é parte do contrato de erro do
  adapter — quem lança e quem captura o erro devem enxergá-lo como a mesma peça.
  Consumidores continuam com `try/catch` e checam `error instanceof ApiError` para pegar
  a `message` amigável vinda do corpo da resposta (`services/page.tsx`,
  `team/page.tsx`, `schedule/page.tsx` fazem isso identicamente).
- **Resposta 2xx sempre no formato `{ data, status, statusText }`.** Isso padroniza o
  "shape" de retorno independente do verbo, o que é o motivo pelo qual todas as páginas
  desestruturam do mesmo jeito: `const { data } = await fetchAdapter<{ services: Service[] }>(...)`.

### Comparação com o `lib/api.ts` anterior

O `lib/api.ts` antigo (removido nesta etapa — ver commit `4145a9c`) tinha uma função por
verbo:

```ts
export async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> { ... }
export async function apiGet<T>(path: string, token?: string): Promise<T> { ... }
```

Duas diferenças relevantes:

1. **Token manual vs. automático.** No `apiPost`/`apiGet` antigo, cada call site
   precisava buscar o token (`getToken()`) e passá-lo explicitamente como terceiro
   argumento. Isso é fácil de esquecer — um novo componente que chame `apiGet` sem
   passar o token simplesmente faz uma requisição anônima sem avisar ninguém. No
   `fetchAdapter`, a injeção é automática: esquecer de passar o token deixa de ser
   possível porque o token nunca é um argumento.
2. **Cobertura de verbos.** `lib/api.ts` só tinha `apiGet`/`apiPost` — `PUT` e `DELETE`
   (usados pelas páginas de Serviços, Equipe e Agenda) exigiriam duas funções novas,
   cada uma reimplementando a mesma lógica de parsing de erro. Com `fetchAdapter`, o
   verbo é só mais um campo do objeto de configuração; nenhuma rota nova exige código
   novo no adapter.

### Comparação com a versão axios de referência

A assinatura do `fetchAdapter` (`{ method, path, body, headers }` → uma função só) segue
deliberadamente o estilo de um adapter baseado em `axios` que o autor já usa em outros
projetos: um único ponto de entrada que recebe uma configuração de requisição e devolve
uma resposta com `data`/`status`. A diferença é puramente de implementação, não de
contrato:

- **axios** resolve baseURL, interceptors de token e parsing de erro via `interceptors`
  configurados uma vez na criação da instância (`axios.create({ baseURL, ... })`), e
  erros não-2xx já chegam como exceção (`AxiosError`) sem esforço extra.
- **`fetchAdapter`** faz manualmente o que os interceptors do axios fariam de graça:
  monta a URL concatenando `API_URL` + `path` a cada chamada, injeta o header de auth
  dentro da própria função, e precisa checar `res.ok` manualmente para decidir se lança
  `ApiError` — o `fetch` nativo não lança em respostas HTTP de erro, só em falha de
  rede.

A troca foi deliberada: `fetch` é nativo do runtime (browser e Node ≥ 18), então adotar
esse padrão não adiciona nenhuma dependência nova ao projeto — o preço é escrever à mão
a parte que o axios dá pronta (verificação de `res.ok`, join de URL), o que aqui cabe
em ~15 linhas dentro do próprio adapter.

---

## 3. O fluxo de uma requisição no backend

Toda rota autenticada segue o mesmo caminho: **route → controller → service →
repository**. Para não ficar abstrato, seguimos um `POST /services` da entrada até o
banco.

### 1. Route — `server/src/routes/serviceRoutes.ts`

```ts
app.post<{ Body: ServiceBody }>(
  "/services",
  {
    schema: serviceBodySchema,
    preHandler: [authenticate, authorize(Role.ADMIN)],
  },
  createService,
);
```

A rota é responsável por três coisas, e só três: **validar a forma dos dados de entrada**
(JSON Schema do Fastify — `name` string não vazia, `duration` inteiro ≥ 1, `price`
número ≥ 0 — requisições malformadas nunca chegam ao controller), **autenticar** (o
`preHandler` `authenticate` chama `request.jwtVerify()`; token ausente ou inválido vira
401 antes de qualquer lógica de negócio rodar) e **autorizar** (`authorize(Role.ADMIN)`
confere `request.user.role`; um EMPLOYEE que tente criar um serviço recebe 403 sem que o
controller sequer seja invocado). A rota **não** sabe nada sobre `businessId`, regras de
conflito ou como o dado é persistido — isso não é responsabilidade dela.

### 2. Controller — `server/src/controllers/serviceController.ts`

```ts
export async function createService(
  request: FastifyRequest<{ Body: ServiceBody }>,
  reply: FastifyReply,
): Promise<void> {
  const service = await serviceService.createService(
    requireBusinessId(request),
    request.body,
  );
  reply.status(201).send({ service });
}
```

O controller é a camada mais fina de todas: **extrai dados da request** (aqui,
`requireBusinessId(request)` — ver seção 4a — e `request.body` já validado pelo schema
da rota), **chama o service** passando esses dados, e **traduz o resultado em resposta
HTTP** (status code + corpo). O controller não decide *se* a operação pode acontecer
(isso é regra de negócio) nem toca em Prisma diretamente — ele só faz a ponte entre o
protocolo HTTP e a camada de domínio.

### 3. Service — `server/src/services/serviceService.ts`

```ts
export const serviceService = {
  createService(businessId: number, input: ServiceInput) {
    return serviceRepository.create(businessId, input);
  },
  // ...
  async deleteService(businessId: number, id: number) {
    await findOwnedService(businessId, id);           // 404 se for de outro business
    const bookings = await serviceRepository.countBookings(id);
    if (bookings > 0) {
      throw new ConflictError("This service has bookings and cannot be deleted"); // 409
    }
    await serviceRepository.deleteWithEmployeeLinks(id);
  },
};
```

É aqui que mora a **regra de negócio**: escopo (o service pertence mesmo a este
`businessId`?), conflitos (este service tem bookings? este slot já está ocupado?) e
orquestração entre repositórios quando uma operação afeta mais de uma tabela (ex.:
`deleteEmployee` remove `EmployeeService` e `Availability` antes de remover o `User`,
todos numa transação — ver `employeeRepository.deleteWithLinks`). O service não sabe
que existe HTTP — não vê `request`/`reply`, não decide status codes diretamente, só
lança as exceções tipadas (`NotFoundError`, `ConflictError`, `BadRequestError` — ver
seção 4b/4c) que o `setErrorHandler` global em `server.ts` converte em status HTTP.

### 4. Repository — `server/src/repositories/serviceRepository.ts`

```ts
create(businessId: number, data: ServiceData) {
  return prisma.service.create({ data: { ...data, businessId } });
},
```

A camada mais próxima do banco: só monta queries Prisma. Não valida nada, não decide
nada — se o service chamar `serviceRepository.create` com um `businessId` errado, o
repository confia e cria. Essa confiança é intencional: validar duas vezes (na service
*e* na repository) espalharia a mesma regra em dois lugares que podem divergir com o
tempo. O repository existe para que, se um dia o Prisma for trocado por outro ORM ou por
SQL cru, só esse arquivo mude — nenhuma regra de negócio depende de como o dado é
persistido.

### Por que a separação importa

Cada camada tem uma única razão para mudar: a rota muda se o formato de entrada/saída
HTTP mudar; o controller muda se a tradução request↔domínio mudar; o service muda se uma
regra de negócio mudar; o repository muda se a forma de persistir mudar. Misturar
camadas (por exemplo, checar `role` dentro do service, ou validar formato de e-mail no
repository) faz com que uma mudança em uma preocupação force revisar código que não
tinha nada a ver com ela.

---

## 4. Decisões de design e por quê

**(a) Escopo por `businessId` do JWT, nunca do cliente.**
Toda query que lista ou modifica um recurso "do meu negócio" usa
`requireBusinessId(request)` (`server/src/lib/requireBusinessId.ts`), que lê
`request.user.businessId` — um campo colocado no JWT no momento do login/accept-invite
(`sendAuthToken` em `authController.ts`, `reply.jwtSign({ sub, role, businessId })`) e
portanto assinado pelo servidor. Nenhuma rota aceita `businessId` como parâmetro de URL
ou body. Se aceitasse, um ADMIN mal-intencionado poderia passar o `businessId` de outro
tenant e ler/editar dados alheios — o `businessId` do token é a única fonte de verdade
possível porque é a única que o cliente não controla.

**(b) 404 em vez de 403 para recurso de outro tenant.**
Em `serviceService.findOwnedService`:

```ts
async function findOwnedService(businessId: number, id: number): Promise<Service> {
  const service = await serviceRepository.findById(id);
  if (!service || service.businessId !== businessId) {
    throw new NotFoundError("Service not found");
  }
  return service;
}
```

Um `PUT /services/999` onde o service 999 existe mas pertence a outro business retorna
**404**, não 403. A diferença importa: 403 confirmaria "esse recurso existe, você só não
pode acessá-lo" — o que já vaza informação sobre a existência de dados de outro tenant.
404 trata "não é seu" e "não existe" como indistinguíveis do ponto de vista de quem
pergunta, o que é o comportamento correto num sistema multi-tenant: um tenant não deve
conseguir nem confirmar a existência de IDs de outro tenant por tentativa e erro. O mesmo
padrão se repete em `findOwnedEmployee` (`employeeService.ts`) e
`findOwnedAvailability` (`availabilityService.ts`).

**(c) 409 para recursos "reservados".**
Dois exemplos: `deleteService` recusa (409) apagar um service com `bookings > 0`
(`serviceRepository.countBookings`), e `updateAvailability`/`deleteAvailability`
recusam (409) mexer num slot com `isBooked = true`. Em ambos os casos, o recurso tem um
histórico ou compromisso que seria destruído silenciosamente por um `DELETE`/`PUT` — 409
Conflict é o status correto para "sua requisição é válida, mas o estado atual do recurso
impede a operação", diferente de 400 (requisição malformada) ou 403 (sem permissão). O
409 também aparece na criação de `Availability` duplicada
(`findByUniqueSlot` + `@@unique([employeeId, date, startTime])` no schema Prisma) — a
constraint de banco garante a unicidade mesmo sob concorrência, e a checagem prévia no
service existe só para devolver uma mensagem amigável antes de bater na constraint.

**(d) Convite de employee reutilizando o fluxo do admin.**
Não existe uma tabela `Invite` separada. `POST /businesses` (convite de admin) e
`POST /employees` (convite de colaborador) fazem exatamente a mesma coisa: criam um
`User` sem `password`, com `inviteToken` + `inviteTokenExpiresAt`
(`generateInviteToken()` em `server/src/lib/inviteToken.ts`), e dependem do mesmo
`POST /auth/accept-invite` para definir a senha (`authService.acceptInvite`, que busca
por `inviteToken`, confere expiração e chama `userRepository.acceptInvite`). A única
diferença entre os dois fluxos é o texto do e-mail (`sendInviteEmail` vs.
`sendEmployeeInviteEmail` em `server/src/lib/inviteEmail.ts`) e o `role`/`businessId`
atribuídos na criação. Reaproveitar a tabela `User` e o mesmo endpoint de aceite evita
duplicar toda a lógica de token/expiração/hash de senha para um segundo tipo de convite.

**(e) `pendingInvite` derivado de `password === null`.**
Não existe uma coluna `status` ou `pendingInvite` no schema. `employeeService.listEmployees`
calcula isso na hora de montar a resposta:

```ts
pendingInvite: employee.password === null,
```

O motivo é simples: um `User` só tem `password` preenchido depois de passar por
`accept-invite` (`userRepository.acceptInvite` grava o hash). "Convite pendente" e
"senha ainda não definida" são exatamente o mesmo fato, então não faz sentido guardar
esse fato duas vezes (uma coluna redundante que poderia dessincronizar do valor real de
`password`). Derivar o campo na leitura garante que ele nunca mente.

**(f) Vínculo employee↔service idempotente via upsert.**
`employeeRepository.linkService`:

```ts
linkService(employeeId: number, serviceId: number) {
  return prisma.employeeService.upsert({
    where: { employeeId_serviceId: { employeeId, serviceId } },
    create: { employeeId, serviceId },
    update: {},
  });
},
```

`POST /employees/:id/services` pode ser chamado duas vezes com o mesmo par
`employeeId`/`serviceId` sem gerar erro de constraint única — o `upsert` simplesmente
não faz nada no `update` se o vínculo já existe. Isso importa porque o frontend
(`team/page.tsx`) não faz nenhum controle prévio de "esse serviço já está vinculado?"
antes de chamar a rota (o `<Select>` já filtra `unlinkedServices`, mas isso é só
UX — um clique duplo ou uma corrida de eventos não deveria virar erro 500 de
constraint violation). Tratar a operação como idempotente na camada certa (repository)
é mais robusto do que confiar que o cliente nunca vai mandar a mesma coisa duas vezes.

---

## Nota de implementação: desvios do código de referência do plano

O plano original (`docs/superpowers/plans/2026-07-24-services-team-schedule.md`) trazia
trechos de código de referência para as três páginas. A implementação final difere em
alguns pontos, todos causados pelo componente `AlertDialog` deste projeto ser baseado em
`@base-ui/react/alert-dialog` (via shadcn) em vez do Radix "clássico":

- **`AlertDialogAction` não fecha o diálogo sozinho.** Em `web/components/ui/alert-dialog.tsx`,
  `AlertDialogCancel` é implementado sobre `AlertDialogPrimitive.Close` (fecha
  automaticamente), mas `AlertDialogAction` é só um `<Button>` puro — sem `Close` embutido.
  Por isso, `handleRemove`/`handleDelete` em `team/page.tsx`, `services/page.tsx` e
  `schedule/page.tsx` fecham o diálogo manualmente (`setRemoving(null)` /
  `setDeleting(null)`) só depois que a chamada à API resolve com sucesso — e o mantêm
  aberto em caso de erro, para que a mensagem de erro (409, por exemplo) apareça dentro
  do próprio diálogo em vez de desaparecer.
- **`.then/.catch/.finally` em vez de `async/await` nos `useEffect` de carregamento.**
  As três páginas usam `loadData`/`loadServices`/`loadAvailabilities` como uma função que
  retorna a Promise encadeada (`fetchAdapter(...).then(...).catch(...).finally(...)`),
  chamada dentro de `useEffect(() => { loadX(); }, [loadX])`. Isso evita declarar a
  função do effect como `async` diretamente (React desaconselha, já que o retorno de um
  effect precisa ser `void` ou uma função de cleanup, nunca uma Promise).
- **Erro de vínculo por card em vez de erro global, na página de Equipe.**
  `team/page.tsx` mantém `linkError` como `{ employeeId, message } | null` em vez de um
  único `formError` da tela. Como cada colaborador tem seu próprio `<Select>` de
  vincular serviço, um erro ao vincular (por exemplo, tentar vincular um serviço que já
  foi removido por outra aba) só deve aparecer sob o card daquele colaborador
  específico — um erro global confundiria qual vínculo falhou quando há vários
  colaboradores na lista.

---

## 5. O que ficou de fora e virá depois

Fora de escopo nesta etapa, por decisão explícita do design spec:

- **Bookings (Fase 3.5 do `server/TASKS.md`)** — `POST /bookings` e `GET /bookings`.
  Depende de Service e Availability (ambos prontos agora), mas a reserva manual pelo
  colaborador e a visão de reservas ainda não existem.
- **Client view pública (Fase 4)** — `GET /app/:businessSlug/services`,
  `GET /app/:businessSlug/services/:serviceId/availabilities` e
  `POST /app/:businessSlug/bookings`, sem autenticação. É o fluxo que um cliente final
  usaria para reservar um horário; depende de Bookings estar pronto.
- **Realtime, e-mail transacional de confirmação e upload (Fase 5)** — WebSocket por
  `businessId` para refletir mudanças de disponibilidade em tempo real na client view,
  envio de e-mail de confirmação ao cliente (os e-mails de convite a Admin/Employee já
  funcionam via `lib/mailer.ts` com preview Ethereal em dev), e upload de avatar via
  Fastify Multipart.
- **Testes automatizados (5.5)** — cobertura das regras críticas (reserva duplicada,
  isolamento por `businessId`, availability duplicada). Até aqui, a verificação de cada
  etapa foi manual (curl + inspeção de banco), documentada no relatório de E2E desta
  tarefa.

Visão de agenda para ADMIN (ver disponibilidade dos colaboradores) também ficou de fora
deliberadamente — depende de uma decisão futura sobre até onde vai a permissão de
leitura de um ADMIN sobre a agenda de terceiros.
