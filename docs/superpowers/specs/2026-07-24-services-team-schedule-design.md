# Design — Serviços, Equipe, Agenda + fetchAdapter

**Data:** 2026-07-24
**Escopo:** Fases 3.2, 3.3 e 3.4 do `server/TASKS.md` (backend) + páginas Serviços, Equipe e Agenda no dashboard (frontend) + refatoração das chamadas de API para um adapter central. Bookings (Fase 3.5) ficam explicitamente fora desta etapa.

---

## 1. Adapter de API (frontend)

**Arquivo:** `web/adapters/fetchAdapter.ts`

Substitui `web/lib/api.ts` (que será apagado). Assinatura no estilo do adapter de referência do usuário, porém com `fetch` nativo (sem axios — zero dependência nova):

```ts
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const fetchAdapter = async <T>({ method, path, body, headers }: {
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}): Promise<{ data: T; status: number; statusText: string }>
```

Comportamento:

- `baseURL` vem de `NEXT_PUBLIC_API_URL` (fallback `http://localhost:3333`), como hoje.
- **Token automático:** se existir token no `localStorage` (via `getToken()` de `lib/auth.ts`), injeta `Authorization: Bearer <token>`. O parâmetro `headers` permite sobrescrever/complementar.
- **Erros:** resposta não-2xx lança `ApiError` (classe movida de `lib/api.ts` para o adapter), com `message` vindo do body da API e `status`. Consumidores continuam usando `try/catch` + `error.message` como hoje.
- Resposta 2xx retorna `{ data, status, statusText }`.

**Consumidores refatorados:** `app/login/login-form.tsx`, `app/accept-invite/accept-invite-form.tsx`, `app/dashboard/layout.tsx`. Nenhum outro arquivo usa `lib/api.ts` hoje.

---

## 2. Backend — novos CRUDs

Todos seguem o padrão existente: **route (JSON Schema do Fastify) → controller → service → repository**, com `preHandler: [authenticate, authorize(...)]`. Todo acesso é escopado pelo `businessId` do usuário autenticado (`request.user`), nunca por parâmetro do cliente.

### 2.1 Services (Fase 3.2)

| Rota | Roles | Regras |
|---|---|---|
| `POST /services` | ADMIN | Cria service no business do admin. `name` (string), `duration` (int, minutos, > 0), `price` (decimal ≥ 0). |
| `GET /services` | ADMIN, EMPLOYEE | Lista services do próprio business. |
| `PUT /services/:id` | ADMIN | Só se o service pertencer ao business do admin (senão 404). |
| `DELETE /services/:id` | ADMIN | Remove vínculos `EmployeeService` na mesma transação. **Se o service tiver bookings, retorna 409** (preserva histórico). |

Arquivos novos: `routes/serviceRoutes.ts`, `controllers/serviceController.ts`, `services/serviceService.ts`, `repositories/serviceRepository.ts`.

### 2.2 Employees (Fase 3.3)

| Rota | Roles | Regras |
|---|---|---|
| `POST /employees` | ADMIN | Cria `User` com `role: EMPLOYEE`, `businessId` do admin, sem senha, com invite token — mesmo fluxo de convite do admin (e-mail via `sendInviteEmail`; falha de e-mail não desfaz o cadastro). 409 se e-mail já existir. |
| `GET /employees` | ADMIN, EMPLOYEE | Lista employees do business com serviços vinculados e status do convite (pendente = sem senha definida). |
| `DELETE /employees/:id` | ADMIN | Só employees do próprio business (senão 404). Remove vínculos `EmployeeService` e availabilities **não reservadas** na mesma transação; **409 se houver availability com `isBooked = true`**. |
| `POST /employees/:id/services` | ADMIN | Vincula o employee a um service (`serviceId` no body). Ambos devem ser do mesmo business (senão 404). Idempotente: vínculo duplicado não é erro. |

Arquivos novos: `routes/employeeRoutes.ts`, `controllers/employeeController.ts`, `services/employeeService.ts`, `repositories/employeeRepository.ts`.

O e-mail de convite reutiliza `lib/inviteEmail.ts` / `lib/inviteToken.ts`; o texto pode ganhar uma variação para colaborador se trivial, senão mantém o texto atual.

### 2.3 Availabilities (Fase 3.4)

| Rota | Roles | Regras |
|---|---|---|
| `POST /availabilities` | EMPLOYEE | Cria availability do próprio usuário (`employeeId = request.user.id`). Campos: `date` (ISO date), `startTime`/`endTime` (`"HH:mm"`). `endTime > startTime`. 409 em duplicata (constraint `@@unique([employeeId, date, startTime])`). |
| `GET /availabilities` | EMPLOYEE | Lista só as próprias, ordenadas por data/hora. |
| `PUT /availabilities/:id` | EMPLOYEE | Só a própria (senão 404). **409 se `isBooked = true`.** |
| `DELETE /availabilities/:id` | EMPLOYEE | Só a própria (senão 404). **409 se `isBooked = true`.** |

Arquivos novos: `routes/availabilityRoutes.ts`, `controllers/availabilityController.ts`, `services/availabilityService.ts`, `repositories/availabilityRepository.ts`.

---

## 3. Frontend — páginas do dashboard

Todas em `app/dashboard/`, usando o layout autenticado existente (`AuthUserProvider` / `useAuthUser`). A sidebar (`app/dashboard/layout.tsx`) troca os itens "em breve" por links reais, filtrados por role:

- **Serviços** e **Equipe**: visíveis para ADMIN e EMPLOYEE (EMPLOYEE em modo somente leitura — sem botões de criar/editar/excluir).
- **Agenda**: visível só para EMPLOYEE.
- SUPERADMIN não vê nenhum dos três (não tem business).

Componentes shadcn faltantes (dialog, table, select, alert-dialog etc.) serão adicionados via CLI conforme a necessidade.

### 3.1 `/dashboard/services`
- Tabela: nome, duração (min), preço (formatado BRL).
- ADMIN: botão "Novo serviço" abre dialog com form (nome, duração, preço); editar reusa o mesmo dialog; excluir pede confirmação e mostra o erro 409 da API quando houver bookings.
- Estados de loading / lista vazia / erro com mensagem da API.

### 3.2 `/dashboard/team`
- Lista de colaboradores: nome, e-mail, badge de status ("Convite pendente" / "Ativo"), serviços vinculados.
- ADMIN: dialog "Convidar colaborador" (nome, e-mail); vincular serviço via select dos services do business; remover com confirmação (mostra 409 quando houver horário reservado).

### 3.3 `/dashboard/schedule` (Agenda)
- Lista dos próprios horários agrupados por dia, ordenados.
- Form/dialog de criar (data, hora início, hora fim), editar e excluir.
- Slots com `isBooked = true` aparecem marcados como "Reservado" e sem ações de editar/excluir.
- Sem visualização de bookings nesta etapa.

---

## 4. Tratamento de erros e testes manuais

- Frontend: todo submit usa `try/catch` sobre o `fetchAdapter`, exibindo `ApiError.message`; 401 no layout continua redirecionando para `/login`.
- Verificação end-to-end (padrão do projeto): subir server + web, exercitar cada fluxo via UI e conferir efeitos no banco (fluxo completo: admin cria service → convida employee → employee aceita convite → cria availability).

## 5. Documentação (entregável)

- Este spec em `docs/superpowers/specs/`.
- Doc explicativo em português ao final da implementação (`docs/2026-07-24-servicos-equipe-agenda.md`), voltado a estudo: padrão adapter, fluxo route→controller→service→repository, decisões (escopo por businessId, 409 em recursos reservados, convite reutilizado).
- Checkboxes das fases 3.2–3.4 marcados no `server/TASKS.md`.

## Fora de escopo

- Bookings (Fase 3.5), client view pública (Fase 4), WebSocket/upload/e-mail transacional de confirmação (Fase 5).
- Visão de agenda para ADMIN (depende de decisão futura sobre permissões de leitura de availabilities).
