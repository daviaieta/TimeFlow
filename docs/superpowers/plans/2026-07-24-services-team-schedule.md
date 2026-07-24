# Serviços, Equipe, Agenda + fetchAdapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar as Fases 3.2–3.4 do backend (Services, Employees, Availabilities), as páginas Serviços/Equipe/Agenda no dashboard e centralizar as chamadas de API do frontend num `fetchAdapter`.

**Architecture:** Backend segue o padrão existente route (JSON Schema) → controller → service → repository, com `authenticate` + `authorize` e escopo por `businessId` do JWT. Frontend usa um adapter único (`web/adapters/fetchAdapter.ts`) com fetch nativo e token automático; páginas são client components sob o layout autenticado do dashboard.

**Tech Stack:** Fastify 5 + Prisma 6 + PostgreSQL (server) · Next.js 16 + React 19 + shadcn (base-ui) + Tailwind 4 (web).

**Spec:** `docs/superpowers/specs/2026-07-24-services-team-schedule-design.md`

## Global Constraints

- Sem infra de testes automatizados neste estágio (Fase 5.5 do TASKS.md adia testes). Cada task verifica com: `npm run typecheck` (server) / `npx tsc --noEmit` (web), `curl` contra o server em dev e UI no browser.
- Toda rota autenticada é escopada pelo `businessId`/`sub` do JWT (`request.user`), nunca por parâmetro vindo do cliente.
- Recurso de outro business (ou de outro employee, no caso de availability) responde **404**, não 403.
- Recursos "reservados" bloqueiam mutação com **409**: service com bookings, employee com availability `isBooked`, availability `isBooked`.
- Mensagens de erro da API em inglês (padrão existente); textos de UI em português (padrão existente).
- Commits frequentes, um por task no mínimo, mensagens em inglês no padrão `feat:`/`refactor:`/`docs:`.
- Credenciais de dev (seed): superadmin `superadmin@timeflow.com` / `SuperAdmin123!`. Server em `http://localhost:3333`, web em `http://localhost:3000`.
- Antes de rodar curl: `cd server && docker compose up -d && npm run dev` (deixe rodando em background). Tokens de convite são impressos no console do server (`console.log(token)`).
- `server/TASKS.md` e `server/PRD.md` são **gitignorados** — atualizar checkboxes, mas não tentar commitá-los.

---

### Task 1: fetchAdapter + refatorar consumidores

**Files:**
- Create: `web/adapters/fetchAdapter.ts`
- Modify: `web/app/login/login-form.tsx`
- Modify: `web/app/accept-invite/accept-invite-form.tsx`
- Modify: `web/app/dashboard/layout.tsx`
- Delete: `web/lib/api.ts`

**Interfaces:**
- Consumes: `getToken()` de `web/lib/auth.ts` (já existe).
- Produces: `fetchAdapter<T>({ method, path, body, headers })` → `Promise<{ data: T; status: number; statusText: string }>`; classe `ApiError { message, status }`. Todas as tasks de frontend seguintes importam de `@/adapters/fetchAdapter`.

- [ ] **Step 1: Criar o adapter**

```ts
// web/adapters/fetchAdapter.ts
import { getToken } from "@/lib/auth";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface FetchAdapterInput {
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface FetchAdapterResponse<T> {
  data: T;
  status: number;
  statusText: string;
}

export const fetchAdapter = async <T = unknown>({
  method,
  path,
  body,
  headers,
}: FetchAdapterInput): Promise<FetchAdapterResponse<T>> => {
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
    const message =
      (data as { message?: string }).message ??
      "Erro inesperado. Tente novamente.";
    throw new ApiError(message, res.status);
  }

  return { data, status: res.status, statusText: res.statusText };
};
```

- [ ] **Step 2: Refatorar `login-form.tsx`**

Trocar o import `import { apiPost } from "@/lib/api";` por `import { fetchAdapter } from "@/adapters/fetchAdapter";` e o corpo do submit:

```ts
// dentro de handleSubmit, substituindo a chamada a apiPost:
const { data } = await fetchAdapter<{ token: string }>({
  method: "POST",
  path: "/auth/login",
  body: { email, password },
});
saveToken(data.token);
router.push("/dashboard");
```

- [ ] **Step 3: Refatorar `accept-invite-form.tsx`**

Mesmo padrão — trocar o import e a chamada:

```ts
const { data } = await fetchAdapter<{ token: string }>({
  method: "POST",
  path: "/auth/accept-invite",
  body: { token, password },
});
saveToken(data.token);
setStatus("success");
```

- [ ] **Step 4: Refatorar `dashboard/layout.tsx`**

Trocar `import { apiGet } from "@/lib/api";` por `import { fetchAdapter } from "@/adapters/fetchAdapter";` e o efeito:

```ts
useEffect(() => {
  const token = getToken();
  if (!token) {
    router.replace("/login");
    return;
  }

  fetchAdapter<{ user: AuthUser }>({ method: "GET", path: "/auth/me" })
    .then(({ data }) => setUser(data.user))
    .catch(() => {
      clearToken();
      router.replace("/login");
    });
}, [router]);
```

- [ ] **Step 5: Apagar `web/lib/api.ts` e conferir que ninguém mais o importa**

Run: `rm web/lib/api.ts && grep -rn "lib/api" web/app web/components web/lib web/adapters`
Expected: nenhum resultado do grep.

- [ ] **Step 6: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Verificação manual de login**

Com server e web rodando, abrir `http://localhost:3000/login`, logar com `superadmin@timeflow.com` / `SuperAdmin123!`.
Expected: redireciona ao dashboard e mostra o nome do usuário (prova que o token automático do adapter funciona no `/auth/me`).

- [ ] **Step 8: Commit**

```bash
git add web/adapters web/app web/lib
git commit -m "refactor(web): centralize API calls in fetchAdapter"
```

---

### Task 2: Backend Services (Fase 3.2)

**Files:**
- Create: `server/src/lib/requireBusinessId.ts`
- Create: `server/src/repositories/serviceRepository.ts`
- Create: `server/src/services/serviceService.ts`
- Create: `server/src/controllers/serviceController.ts`
- Create: `server/src/routes/serviceRoutes.ts`
- Modify: `server/src/server.ts` (registrar rota)

**Interfaces:**
- Consumes: `request.user: { sub, role, businessId }` (JWT), `errors.ts`, `prisma`.
- Produces: `GET /services` → `{ services: Service[] }`; `POST /services` → 201 `{ service }`; `PUT /services/:id` → `{ service }`; `DELETE /services/:id` → 204. `serviceRepository.findById(id)` é reutilizado pela Task 3. Helper `requireBusinessId(request): number` reutilizado pelas Tasks 3.

- [ ] **Step 1: Helper de escopo**

```ts
// server/src/lib/requireBusinessId.ts
import { FastifyRequest } from "fastify";
import { ForbiddenError } from "./errors";

export function requireBusinessId(request: FastifyRequest): number {
  const { businessId } = request.user;
  if (businessId === null) {
    throw new ForbiddenError("User is not linked to a business");
  }

  return businessId;
}
```

- [ ] **Step 2: Repository**

```ts
// server/src/repositories/serviceRepository.ts
import { prisma } from "../lib/prisma";

interface ServiceData {
  name: string;
  duration: number;
  price: number;
}

export const serviceRepository = {
  findManyByBusiness(businessId: number) {
    return prisma.service.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });
  },

  findById(id: number) {
    return prisma.service.findUnique({ where: { id } });
  },

  create(businessId: number, data: ServiceData) {
    return prisma.service.create({ data: { ...data, businessId } });
  },

  update(id: number, data: ServiceData) {
    return prisma.service.update({ where: { id }, data });
  },

  countBookings(serviceId: number) {
    return prisma.booking.count({ where: { serviceId } });
  },

  deleteWithEmployeeLinks(id: number) {
    return prisma.$transaction([
      prisma.employeeService.deleteMany({ where: { serviceId: id } }),
      prisma.service.delete({ where: { id } }),
    ]);
  },
};
```

- [ ] **Step 3: Service layer**

```ts
// server/src/services/serviceService.ts
import { Service } from "@prisma/client";
import { ConflictError, NotFoundError } from "../lib/errors";
import { serviceRepository } from "../repositories/serviceRepository";

interface ServiceInput {
  name: string;
  duration: number;
  price: number;
}

async function findOwnedService(businessId: number, id: number): Promise<Service> {
  const service = await serviceRepository.findById(id);
  if (!service || service.businessId !== businessId) {
    throw new NotFoundError("Service not found");
  }

  return service;
}

export const serviceService = {
  listServices(businessId: number) {
    return serviceRepository.findManyByBusiness(businessId);
  },

  createService(businessId: number, input: ServiceInput) {
    return serviceRepository.create(businessId, input);
  },

  async updateService(businessId: number, id: number, input: ServiceInput) {
    await findOwnedService(businessId, id);
    return serviceRepository.update(id, input);
  },

  async deleteService(businessId: number, id: number) {
    await findOwnedService(businessId, id);

    const bookings = await serviceRepository.countBookings(id);
    if (bookings > 0) {
      throw new ConflictError("This service has bookings and cannot be deleted");
    }

    await serviceRepository.deleteWithEmployeeLinks(id);
  },
};
```

- [ ] **Step 4: Controller**

```ts
// server/src/controllers/serviceController.ts
import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import { serviceService } from "../services/serviceService";

export interface ServiceBody {
  name: string;
  duration: number;
  price: number;
}

export interface ServiceParams {
  id: number;
}

export async function listServices(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const services = await serviceService.listServices(requireBusinessId(request));
  reply.send({ services });
}

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

export async function updateService(
  request: FastifyRequest<{ Body: ServiceBody; Params: ServiceParams }>,
  reply: FastifyReply,
): Promise<void> {
  const service = await serviceService.updateService(
    requireBusinessId(request),
    request.params.id,
    request.body,
  );
  reply.send({ service });
}

export async function deleteService(
  request: FastifyRequest<{ Params: ServiceParams }>,
  reply: FastifyReply,
): Promise<void> {
  await serviceService.deleteService(requireBusinessId(request), request.params.id);
  reply.status(204).send();
}
```

- [ ] **Step 5: Routes**

```ts
// server/src/routes/serviceRoutes.ts
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createService,
  deleteService,
  listServices,
  updateService,
  ServiceBody,
  ServiceParams,
} from "../controllers/serviceController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const serviceBodySchema = {
  body: {
    type: "object",
    required: ["name", "duration", "price"],
    properties: {
      name: { type: "string", minLength: 1 },
      duration: { type: "integer", minimum: 1 },
      price: { type: "number", minimum: 0 },
    },
  },
};

const serviceParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

export async function serviceRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ServiceBody }>(
    "/services",
    {
      schema: serviceBodySchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    createService,
  );

  app.get(
    "/services",
    { preHandler: [authenticate, authorize(Role.ADMIN, Role.EMPLOYEE)] },
    listServices,
  );

  app.put<{ Body: ServiceBody; Params: ServiceParams }>(
    "/services/:id",
    {
      schema: { ...serviceBodySchema, ...serviceParamsSchema },
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    updateService,
  );

  app.delete<{ Params: ServiceParams }>(
    "/services/:id",
    {
      schema: serviceParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    deleteService,
  );
}
```

- [ ] **Step 6: Registrar em `server.ts`**

Adicionar junto aos registros existentes:

```ts
import { serviceRoutes } from "./routes/serviceRoutes";
// ...
app.register(serviceRoutes);
```

- [ ] **Step 7: Typecheck**

Run: `cd server && npm run typecheck`
Expected: sem erros.

- [ ] **Step 8: Verificar com curl**

Com o server rodando (`npm run dev`) e banco up. Se ainda não existir um business de teste, criar (o invite token do admin aparece no console do server):

```bash
SA_TOKEN=$(curl -s -X POST http://localhost:3333/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@timeflow.com","password":"SuperAdmin123!"}' | jq -r .token)

curl -s -X POST http://localhost:3333/businesses \
  -H "Authorization: Bearer $SA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Barbearia Teste","slug":"barbearia-teste","admin":{"name":"Ana Admin","email":"ana@teste.com"}}'

# copiar INVITE_TOKEN do console do server:
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3333/auth/accept-invite \
  -H 'Content-Type: application/json' \
  -d '{"token":"INVITE_TOKEN","password":"Admin123!"}' | jq -r .token)

# CRUD:
curl -s -X POST http://localhost:3333/services \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Corte","duration":30,"price":50}'
curl -s http://localhost:3333/services -H "Authorization: Bearer $ADMIN_TOKEN"
curl -s -X PUT http://localhost:3333/services/1 \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Corte Premium","duration":45,"price":70}'
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3333/services/999 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Expected: POST → 201 com `{ service }`; GET → `{ services: [...] }`; PUT → nome atualizado; DELETE de id inexistente → `404`. Reaproveitar `ADMIN_TOKEN` nas Tasks 3 e 4 (guardar num arquivo de scratch se precisar).

- [ ] **Step 9: Commit**

```bash
git add server/src
git commit -m "feat(server): service CRUD scoped by business (phase 3.2)"
```

---

### Task 3: Backend Employees (Fase 3.3)

**Files:**
- Create: `server/src/repositories/employeeRepository.ts`
- Create: `server/src/services/employeeService.ts`
- Create: `server/src/controllers/employeeController.ts`
- Create: `server/src/routes/employeeRoutes.ts`
- Modify: `server/src/lib/inviteEmail.ts` (novo template de employee)
- Modify: `server/src/repositories/businessRepository.ts` (adicionar `findById`)
- Modify: `server/src/server.ts` (registrar rota)

**Interfaces:**
- Consumes: `requireBusinessId` (Task 2), `serviceRepository.findById` (Task 2), `userRepository.findByEmail`, `generateInviteToken`, `env.webOrigin`.
- Produces: `POST /employees` → 201 `{ employee: { id, name, email } }`; `GET /employees` → `{ employees: [{ id, name, email, pendingInvite, services: [{ id, name }] }] }`; `DELETE /employees/:id` → 204; `POST /employees/:id/services` (body `{ serviceId }`) → 204.

- [ ] **Step 1: `findById` no businessRepository**

Adicionar ao objeto `businessRepository` existente:

```ts
findById(id: number) {
  return prisma.business.findUnique({ where: { id } });
},
```

- [ ] **Step 2: Template de convite de employee**

Adicionar em `server/src/lib/inviteEmail.ts` (mantendo o existente):

```ts
interface EmployeeInviteEmailInput {
  to: string;
  employeeName: string;
  businessName: string;
  inviteLink: string;
}

export function sendEmployeeInviteEmail(input: EmployeeInviteEmailInput): Promise<void> {
  const { to, employeeName, businessName, inviteLink } = input;

  return sendMail({
    to,
    subject: `Você foi convidado para a equipe de ${businessName} no Time Flow`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Olá, ${employeeName}!</h2>
        <p>
          Você foi convidado para fazer parte da equipe de
          <strong>${businessName}</strong> no Time Flow.
        </p>
        <p>Para ativar sua conta, defina sua senha pelo link abaixo:</p>
        <p>
          <a
            href="${inviteLink}"
            style="display: inline-block; background: #4338ca; color: #fff; padding: 12px 24px; border-radius: 9999px; text-decoration: none;"
          >
            Definir minha senha
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">
          O link expira em 48 horas. Se você não esperava este convite, ignore este e-mail.
        </p>
      </div>
    `,
  });
}
```

- [ ] **Step 3: Repository**

```ts
// server/src/repositories/employeeRepository.ts
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface CreateEmployeeInput {
  name: string;
  email: string;
  businessId: number;
  inviteToken: string;
  inviteTokenExpiresAt: Date;
}

export const employeeRepository = {
  findManyByBusiness(businessId: number) {
    return prisma.user.findMany({
      where: { businessId, role: Role.EMPLOYEE },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        services: {
          select: { service: { select: { id: true, name: true } } },
        },
      },
    });
  },

  findById(id: number) {
    return prisma.user.findUnique({ where: { id } });
  },

  create(data: CreateEmployeeInput) {
    return prisma.user.create({ data: { ...data, role: Role.EMPLOYEE } });
  },

  countBookedAvailabilities(employeeId: number) {
    return prisma.availability.count({ where: { employeeId, isBooked: true } });
  },

  deleteWithLinks(id: number) {
    return prisma.$transaction([
      prisma.employeeService.deleteMany({ where: { employeeId: id } }),
      prisma.availability.deleteMany({ where: { employeeId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);
  },

  linkService(employeeId: number, serviceId: number) {
    return prisma.employeeService.upsert({
      where: { employeeId_serviceId: { employeeId, serviceId } },
      create: { employeeId, serviceId },
      update: {},
    });
  },
};
```

- [ ] **Step 4: Service layer**

```ts
// server/src/services/employeeService.ts
import { Role, User } from "@prisma/client";
import { env } from "../config/env";
import { ConflictError, NotFoundError } from "../lib/errors";
import { sendEmployeeInviteEmail } from "../lib/inviteEmail";
import { generateInviteToken } from "../lib/inviteToken";
import { businessRepository } from "../repositories/businessRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import { userRepository } from "../repositories/userRepository";

interface CreateEmployeeInput {
  name: string;
  email: string;
}

async function findOwnedEmployee(businessId: number, id: number): Promise<User> {
  const employee = await employeeRepository.findById(id);
  if (!employee || employee.businessId !== businessId || employee.role !== Role.EMPLOYEE) {
    throw new NotFoundError("Employee not found");
  }

  return employee;
}

export const employeeService = {
  async listEmployees(businessId: number) {
    const employees = await employeeRepository.findManyByBusiness(businessId);

    return employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      pendingInvite: employee.password === null,
      services: employee.services.map((link) => link.service),
    }));
  },

  async createEmployee(businessId: number, input: CreateEmployeeInput) {
    const emailTaken = await userRepository.findByEmail(input.email);
    if (emailTaken) {
      throw new ConflictError("A user with this email already exists");
    }

    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const { token, expiresAt } = generateInviteToken();

    const employee = await employeeRepository.create({
      name: input.name,
      email: input.email,
      businessId,
      inviteToken: token,
      inviteTokenExpiresAt: expiresAt,
    });

    const inviteLink = `${env.webOrigin}/accept-invite?token=${token}`;

    try {
      await sendEmployeeInviteEmail({
        to: employee.email,
        employeeName: employee.name,
        businessName: business.name,
        inviteLink,
      });
    } catch (error) {
      // O employee já foi criado — falha no e-mail não deve desfazer o cadastro.
      console.error(`Failed to send invite email to ${employee.email}:`, error);
      console.log(`Invite link for ${employee.email}: ${inviteLink}`);
    }

    return { id: employee.id, name: employee.name, email: employee.email };
  },

  async deleteEmployee(businessId: number, id: number) {
    await findOwnedEmployee(businessId, id);

    const booked = await employeeRepository.countBookedAvailabilities(id);
    if (booked > 0) {
      throw new ConflictError("This employee has booked time slots and cannot be removed");
    }

    await employeeRepository.deleteWithLinks(id);
  },

  async linkService(businessId: number, employeeId: number, serviceId: number) {
    await findOwnedEmployee(businessId, employeeId);

    const service = await serviceRepository.findById(serviceId);
    if (!service || service.businessId !== businessId) {
      throw new NotFoundError("Service not found");
    }

    await employeeRepository.linkService(employeeId, serviceId);
  },
};
```

- [ ] **Step 5: Controller**

```ts
// server/src/controllers/employeeController.ts
import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import { employeeService } from "../services/employeeService";

export interface CreateEmployeeBody {
  name: string;
  email: string;
}

export interface EmployeeParams {
  id: number;
}

export interface LinkServiceBody {
  serviceId: number;
}

export async function listEmployees(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const employees = await employeeService.listEmployees(requireBusinessId(request));
  reply.send({ employees });
}

export async function createEmployee(
  request: FastifyRequest<{ Body: CreateEmployeeBody }>,
  reply: FastifyReply,
): Promise<void> {
  const employee = await employeeService.createEmployee(
    requireBusinessId(request),
    request.body,
  );
  reply.status(201).send({ employee });
}

export async function deleteEmployee(
  request: FastifyRequest<{ Params: EmployeeParams }>,
  reply: FastifyReply,
): Promise<void> {
  await employeeService.deleteEmployee(requireBusinessId(request), request.params.id);
  reply.status(204).send();
}

export async function linkService(
  request: FastifyRequest<{ Params: EmployeeParams; Body: LinkServiceBody }>,
  reply: FastifyReply,
): Promise<void> {
  await employeeService.linkService(
    requireBusinessId(request),
    request.params.id,
    request.body.serviceId,
  );
  reply.status(204).send();
}
```

- [ ] **Step 6: Routes**

```ts
// server/src/routes/employeeRoutes.ts
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createEmployee,
  deleteEmployee,
  linkService,
  listEmployees,
  CreateEmployeeBody,
  EmployeeParams,
  LinkServiceBody,
} from "../controllers/employeeController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const createEmployeeSchema = {
  body: {
    type: "object",
    required: ["name", "email"],
    properties: {
      name: { type: "string", minLength: 1 },
      email: { type: "string", format: "email" },
    },
  },
};

const employeeParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

const linkServiceSchema = {
  ...employeeParamsSchema,
  body: {
    type: "object",
    required: ["serviceId"],
    properties: {
      serviceId: { type: "integer" },
    },
  },
};

export async function employeeRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateEmployeeBody }>(
    "/employees",
    {
      schema: createEmployeeSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    createEmployee,
  );

  app.get(
    "/employees",
    { preHandler: [authenticate, authorize(Role.ADMIN, Role.EMPLOYEE)] },
    listEmployees,
  );

  app.delete<{ Params: EmployeeParams }>(
    "/employees/:id",
    {
      schema: employeeParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    deleteEmployee,
  );

  app.post<{ Params: EmployeeParams; Body: LinkServiceBody }>(
    "/employees/:id/services",
    {
      schema: linkServiceSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    linkService,
  );
}
```

- [ ] **Step 7: Registrar em `server.ts`**

```ts
import { employeeRoutes } from "./routes/employeeRoutes";
// ...
app.register(employeeRoutes);
```

- [ ] **Step 8: Typecheck**

Run: `cd server && npm run typecheck`
Expected: sem erros.

- [ ] **Step 9: Verificar com curl**

Com `ADMIN_TOKEN` da Task 2:

```bash
curl -s -X POST http://localhost:3333/employees \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Beto Barbeiro","email":"beto@teste.com"}'
# → 201; console do server imprime o invite token do Beto (guardar para Task 4)

curl -s http://localhost:3333/employees -H "Authorization: Bearer $ADMIN_TOKEN"
# → { employees: [{ ..., pendingInvite: true, services: [] }] }

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3333/employees/EMPLOYEE_ID/services \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"serviceId":1}'
# → 204; repetir o mesmo comando → 204 de novo (idempotente)

curl -s http://localhost:3333/employees -H "Authorization: Bearer $ADMIN_TOKEN"
# → services: [{ id: 1, name: "Corte Premium" }]

curl -s -X POST http://localhost:3333/employees \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Duplicado","email":"beto@teste.com"}'
# → 409
```

- [ ] **Step 10: Commit**

```bash
git add server/src
git commit -m "feat(server): employee invite flow and service linking (phase 3.3)"
```

---

### Task 4: Backend Availabilities (Fase 3.4)

**Files:**
- Create: `server/src/repositories/availabilityRepository.ts`
- Create: `server/src/services/availabilityService.ts`
- Create: `server/src/controllers/availabilityController.ts`
- Create: `server/src/routes/availabilityRoutes.ts`
- Modify: `server/src/lib/errors.ts` (adicionar `BadRequestError`)
- Modify: `server/src/server.ts` (registrar rota)

**Interfaces:**
- Consumes: `request.user.sub` (id do employee logado), `errors.ts`, `prisma`.
- Produces: `GET /availabilities` → `{ availabilities: Availability[] }` (date como ISO string); `POST /availabilities` (body `{ date: "YYYY-MM-DD", startTime: "HH:mm", endTime: "HH:mm" }`) → 201 `{ availability }`; `PUT /availabilities/:id` → `{ availability }`; `DELETE /availabilities/:id` → 204.

- [ ] **Step 1: `BadRequestError`**

Adicionar em `server/src/lib/errors.ts`:

```ts
export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(message, 400);
  }
}
```

- [ ] **Step 2: Repository**

```ts
// server/src/repositories/availabilityRepository.ts
import { prisma } from "../lib/prisma";

interface AvailabilityData {
  date: Date;
  startTime: string;
  endTime: string;
}

export const availabilityRepository = {
  findManyByEmployee(employeeId: number) {
    return prisma.availability.findMany({
      where: { employeeId },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
  },

  findById(id: number) {
    return prisma.availability.findUnique({ where: { id } });
  },

  findByUniqueSlot(employeeId: number, date: Date, startTime: string) {
    return prisma.availability.findUnique({
      where: { employeeId_date_startTime: { employeeId, date, startTime } },
    });
  },

  create(employeeId: number, data: AvailabilityData) {
    return prisma.availability.create({ data: { ...data, employeeId } });
  },

  update(id: number, data: AvailabilityData) {
    return prisma.availability.update({ where: { id }, data });
  },

  delete(id: number) {
    return prisma.availability.delete({ where: { id } });
  },
};
```

- [ ] **Step 3: Service layer**

```ts
// server/src/services/availabilityService.ts
import { Availability } from "@prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";

interface AvailabilityInput {
  date: string;
  startTime: string;
  endTime: string;
}

function validateTimeRange(input: AvailabilityInput): void {
  // "HH:mm" com zero à esquerda compara corretamente como string
  if (input.endTime <= input.startTime) {
    throw new BadRequestError("endTime must be after startTime");
  }
}

async function findOwnedAvailability(employeeId: number, id: number): Promise<Availability> {
  const availability = await availabilityRepository.findById(id);
  if (!availability || availability.employeeId !== employeeId) {
    throw new NotFoundError("Availability not found");
  }

  return availability;
}

export const availabilityService = {
  listAvailabilities(employeeId: number) {
    return availabilityRepository.findManyByEmployee(employeeId);
  },

  async createAvailability(employeeId: number, input: AvailabilityInput) {
    validateTimeRange(input);

    const date = new Date(input.date);
    const duplicate = await availabilityRepository.findByUniqueSlot(
      employeeId,
      date,
      input.startTime,
    );
    if (duplicate) {
      throw new ConflictError("You already have a time slot starting at this time");
    }

    return availabilityRepository.create(employeeId, {
      date,
      startTime: input.startTime,
      endTime: input.endTime,
    });
  },

  async updateAvailability(employeeId: number, id: number, input: AvailabilityInput) {
    validateTimeRange(input);

    const availability = await findOwnedAvailability(employeeId, id);
    if (availability.isBooked) {
      throw new ConflictError("This time slot is booked and cannot be changed");
    }

    const date = new Date(input.date);
    const duplicate = await availabilityRepository.findByUniqueSlot(
      employeeId,
      date,
      input.startTime,
    );
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError("You already have a time slot starting at this time");
    }

    return availabilityRepository.update(id, {
      date,
      startTime: input.startTime,
      endTime: input.endTime,
    });
  },

  async deleteAvailability(employeeId: number, id: number) {
    const availability = await findOwnedAvailability(employeeId, id);
    if (availability.isBooked) {
      throw new ConflictError("This time slot is booked and cannot be deleted");
    }

    await availabilityRepository.delete(id);
  },
};
```

- [ ] **Step 4: Controller**

```ts
// server/src/controllers/availabilityController.ts
import { FastifyReply, FastifyRequest } from "fastify";
import { availabilityService } from "../services/availabilityService";

export interface AvailabilityBody {
  date: string;
  startTime: string;
  endTime: string;
}

export interface AvailabilityParams {
  id: number;
}

export async function listAvailabilities(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const availabilities = await availabilityService.listAvailabilities(request.user.sub);
  reply.send({ availabilities });
}

export async function createAvailability(
  request: FastifyRequest<{ Body: AvailabilityBody }>,
  reply: FastifyReply,
): Promise<void> {
  const availability = await availabilityService.createAvailability(
    request.user.sub,
    request.body,
  );
  reply.status(201).send({ availability });
}

export async function updateAvailability(
  request: FastifyRequest<{ Body: AvailabilityBody; Params: AvailabilityParams }>,
  reply: FastifyReply,
): Promise<void> {
  const availability = await availabilityService.updateAvailability(
    request.user.sub,
    request.params.id,
    request.body,
  );
  reply.send({ availability });
}

export async function deleteAvailability(
  request: FastifyRequest<{ Params: AvailabilityParams }>,
  reply: FastifyReply,
): Promise<void> {
  await availabilityService.deleteAvailability(request.user.sub, request.params.id);
  reply.status(204).send();
}
```

- [ ] **Step 5: Routes**

```ts
// server/src/routes/availabilityRoutes.ts
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createAvailability,
  deleteAvailability,
  listAvailabilities,
  updateAvailability,
  AvailabilityBody,
  AvailabilityParams,
} from "../controllers/availabilityController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const availabilityBodySchema = {
  body: {
    type: "object",
    required: ["date", "startTime", "endTime"],
    properties: {
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      startTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
      endTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    },
  },
};

const availabilityParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

export async function availabilityRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: AvailabilityBody }>(
    "/availabilities",
    {
      schema: availabilityBodySchema,
      preHandler: [authenticate, authorize(Role.EMPLOYEE)],
    },
    createAvailability,
  );

  app.get(
    "/availabilities",
    { preHandler: [authenticate, authorize(Role.EMPLOYEE)] },
    listAvailabilities,
  );

  app.put<{ Body: AvailabilityBody; Params: AvailabilityParams }>(
    "/availabilities/:id",
    {
      schema: { ...availabilityBodySchema, ...availabilityParamsSchema },
      preHandler: [authenticate, authorize(Role.EMPLOYEE)],
    },
    updateAvailability,
  );

  app.delete<{ Params: AvailabilityParams }>(
    "/availabilities/:id",
    {
      schema: availabilityParamsSchema,
      preHandler: [authenticate, authorize(Role.EMPLOYEE)],
    },
    deleteAvailability,
  );
}
```

- [ ] **Step 6: Registrar em `server.ts`**

```ts
import { availabilityRoutes } from "./routes/availabilityRoutes";
// ...
app.register(availabilityRoutes);
```

- [ ] **Step 7: Typecheck**

Run: `cd server && npm run typecheck`
Expected: sem erros.

- [ ] **Step 8: Verificar com curl**

Aceitar o convite do Beto (token impresso no console na Task 3) e exercitar o CRUD:

```bash
EMP_TOKEN=$(curl -s -X POST http://localhost:3333/auth/accept-invite \
  -H 'Content-Type: application/json' \
  -d '{"token":"BETO_INVITE_TOKEN","password":"Beto1234!"}' | jq -r .token)

curl -s -X POST http://localhost:3333/availabilities \
  -H "Authorization: Bearer $EMP_TOKEN" -H 'Content-Type: application/json' \
  -d '{"date":"2026-08-03","startTime":"09:00","endTime":"09:30"}'
# → 201

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3333/availabilities \
  -H "Authorization: Bearer $EMP_TOKEN" -H 'Content-Type: application/json' \
  -d '{"date":"2026-08-03","startTime":"09:00","endTime":"10:00"}'
# → 409 (slot duplicado)

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3333/availabilities \
  -H "Authorization: Bearer $EMP_TOKEN" -H 'Content-Type: application/json' \
  -d '{"date":"2026-08-03","startTime":"11:00","endTime":"10:00"}'
# → 400 (endTime <= startTime)

curl -s http://localhost:3333/availabilities -H "Authorization: Bearer $EMP_TOKEN"
# → { availabilities: [...] }

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/availabilities \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → 403 (ADMIN não acessa)
```

- [ ] **Step 9: Commit**

```bash
git add server/src
git commit -m "feat(server): employee availability CRUD (phase 3.4)"
```

---

### Task 5: Componentes shadcn, tipos compartilhados e sidebar por role

**Files:**
- Create (via CLI): `web/components/ui/dialog.tsx`, `web/components/ui/alert-dialog.tsx`, `web/components/ui/table.tsx`, `web/components/ui/select.tsx`, `web/components/ui/badge.tsx`
- Create: `web/lib/types.ts`
- Modify: `web/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `AuthUser`/`Role` de `lib/auth.ts`.
- Produces: tipos `Service`, `Employee`, `Availability` usados pelas Tasks 6–8; sidebar com links reais filtrados por role.

- [ ] **Step 1: Adicionar componentes shadcn**

Antes de rodar, invocar a skill `shadcn` (está em `web/.claude/skills`) para confirmar o comando correto neste projeto. Comando esperado:

Run: `cd web && npx shadcn@latest add dialog alert-dialog table select badge`
Expected: 5 arquivos novos em `web/components/ui/`. **Abrir os arquivos gerados e conferir os nomes exportados** — o projeto usa shadcn sobre `@base-ui/react`; se algum nome divergir do usado nas Tasks 6–8 (ex.: `DialogFooter`), ajustar os imports das páginas ao gerado.

- [ ] **Step 2: Tipos compartilhados**

```ts
// web/lib/types.ts
export interface Service {
  id: number;
  name: string;
  duration: number;
  price: string; // Prisma Decimal serializa como string no JSON
}

export interface EmployeeServiceLink {
  id: number;
  name: string;
}

export interface Employee {
  id: number;
  name: string;
  email: string;
  pendingInvite: boolean;
  services: EmployeeServiceLink[];
}

export interface Availability {
  id: number;
  date: string; // ISO string vinda da API
  startTime: string;
  endTime: string;
  isBooked: boolean;
}
```

- [ ] **Step 3: Sidebar com links reais e filtro por role**

Em `web/app/dashboard/layout.tsx`: adicionar `usePathname` ao import de `next/navigation`, importar `Role` de `@/lib/auth`, e substituir `navItems` e o `<nav>`:

```tsx
const navItems: {
  label: string;
  href: string;
  icon: typeof DashboardSquare01Icon;
  roles: Role[];
}[] = [
  {
    label: "Visão geral",
    href: "/dashboard",
    icon: DashboardSquare01Icon,
    roles: ["SUPERADMIN", "ADMIN", "EMPLOYEE"],
  },
  {
    label: "Serviços",
    href: "/dashboard/services",
    icon: Scissor01Icon,
    roles: ["ADMIN", "EMPLOYEE"],
  },
  {
    label: "Equipe",
    href: "/dashboard/team",
    icon: UserGroupIcon,
    roles: ["ADMIN", "EMPLOYEE"],
  },
  {
    label: "Agenda",
    href: "/dashboard/schedule",
    icon: Calendar03Icon,
    roles: ["EMPLOYEE"],
  },
];
```

Dentro do componente (`const pathname = usePathname();`) e no JSX:

```tsx
<nav className="mt-8 flex flex-col gap-1">
  {navItems
    .filter((item) => item.roles.includes(user.role))
    .map((item) => {
      const active = pathname === item.href;
      return (
        <a
          key={item.href}
          href={item.href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            active
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" />
          {item.label}
        </a>
      );
    })}
</nav>
```

Remover o campo `soon` e o badge "em breve".

- [ ] **Step 4: Typecheck + verificação visual**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros. No browser, logado como superadmin: só "Visão geral" aparece. (Roles ADMIN/EMPLOYEE serão vistos nas tasks seguintes.)

- [ ] **Step 5: Commit**

```bash
git add web/components web/lib web/app
git commit -m "feat(web): role-aware sidebar, shared API types and shadcn primitives"
```

---

### Task 6: Página Serviços

**Files:**
- Create: `web/app/dashboard/services/page.tsx`

**Interfaces:**
- Consumes: `fetchAdapter`/`ApiError` (Task 1), `Service` (Task 5), componentes ui (Task 5), `useAuthUser()`.
- Produces: rota `/dashboard/services`.

- [ ] **Step 1: Implementar a página**

```tsx
// web/app/dashboard/services/page.tsx
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Service } from "@/lib/types";
import { useAuthUser } from "../auth-context";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function ServicesPage() {
  const user = useAuthUser();
  const isAdmin = user.role === "ADMIN";

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [price, setPrice] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleting, setDeleting] = useState<Service | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    try {
      const { data } = await fetchAdapter<{ services: Service[] }>({
        method: "GET",
        path: "/services",
      });
      setServices(data.services);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  function openCreate() {
    setEditing(null);
    setName("");
    setDuration("");
    setPrice("");
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setName(service.name);
    setDuration(String(service.duration));
    setPrice(service.price);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const body = { name, duration: Number(duration), price: Number(price) };

    try {
      if (editing) {
        await fetchAdapter({
          method: "PUT",
          path: `/services/${editing.id}`,
          body,
        });
      } else {
        await fetchAdapter({ method: "POST", path: "/services", body });
      }
      setDialogOpen(false);
      await loadServices();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteError(null);

    try {
      await fetchAdapter({ method: "DELETE", path: `/services/${deleting.id}` });
      setDeleting(null);
      await loadServices();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Erro inesperado.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Serviços</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Gerencie os serviços oferecidos pelo seu negócio."
              : "Serviços oferecidos pelo negócio."}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            Novo serviço
          </Button>
        )}
      </div>

      <div className="mt-8 rounded-2xl border bg-card">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Spinner />
          </div>
        ) : listError ? (
          <p className="p-12 text-center text-sm text-destructive">{listError}</p>
        ) : services.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted-foreground">
            Nenhum serviço cadastrado ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Preço</TableHead>
                {isAdmin && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.name}</TableCell>
                  <TableCell>{service.duration} min</TableCell>
                  <TableCell>{currency.format(Number(service.price))}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar ${service.name}`}
                          onClick={() => openEdit(service)}
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Excluir ${service.name}`}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(service);
                          }}
                        >
                          <HugeiconsIcon icon={Delete02Icon} />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar serviço" : "Novo serviço"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Atualize os dados do serviço."
                : "Cadastre um serviço oferecido pelo negócio."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="service-name">Nome</FieldLabel>
                <Input
                  id="service-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Corte de cabelo"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="service-duration">Duração (minutos)</FieldLabel>
                <Input
                  id="service-duration"
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="service-price">Preço (R$)</FieldLabel>
                <Input
                  id="service-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  required
                />
              </Field>
              {formError && <FieldError>{formError}</FieldError>}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Salvando…
                    </>
                  ) : (
                    "Salvar"
                  )}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir “{deleting?.name}”? Essa ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

Nota: se os componentes gerados na Task 5 tiverem API diferente (base-ui), adaptar imports/props ao gerado — o comportamento esperado é o descrito aqui. `event.preventDefault()` no `AlertDialogAction` impede o fechamento automático para o erro 409 ficar visível.

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Verificação na UI**

Logar como `ana@teste.com` / `Admin123!` → `/dashboard/services`:
1. Lista mostra o serviço criado via curl na Task 2.
2. Criar serviço novo → aparece na tabela.
3. Editar → valores atualizam.
4. Excluir → some da tabela.
5. Logar como `beto@teste.com` / `Beto1234!` → vê a tabela sem botões de ação.

- [ ] **Step 4: Commit**

```bash
git add web/app/dashboard/services
git commit -m "feat(web): services page with admin CRUD"
```

---

### Task 7: Página Equipe

**Files:**
- Create: `web/app/dashboard/team/page.tsx`

**Interfaces:**
- Consumes: `fetchAdapter`/`ApiError`, `Employee`/`Service` (Task 5), componentes ui, `useAuthUser()`.
- Produces: rota `/dashboard/team`.

- [ ] **Step 1: Implementar a página**

```tsx
// web/app/dashboard/team/page.tsx
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Employee, Service } from "@/lib/types";
import { useAuthUser } from "../auth-context";

export default function TeamPage() {
  const user = useAuthUser();
  const isAdmin = user.role === "ADMIN";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [removing, setRemoving] = useState<Employee | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [employeesRes, servicesRes] = await Promise.all([
        fetchAdapter<{ employees: Employee[] }>({
          method: "GET",
          path: "/employees",
        }),
        fetchAdapter<{ services: Service[] }>({
          method: "GET",
          path: "/services",
        }),
      ]);
      setEmployees(employeesRes.data.employees);
      setServices(servicesRes.data.services);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openInvite() {
    setName("");
    setEmail("");
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await fetchAdapter({
        method: "POST",
        path: "/employees",
        body: { name, email },
      });
      setDialogOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLinkService(employee: Employee, serviceId: string) {
    try {
      await fetchAdapter({
        method: "POST",
        path: `/employees/${employee.id}/services`,
        body: { serviceId: Number(serviceId) },
      });
      await loadData();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
    }
  }

  async function handleRemove() {
    if (!removing) return;
    setRemoveError(null);

    try {
      await fetchAdapter({ method: "DELETE", path: `/employees/${removing.id}` });
      setRemoving(null);
      await loadData();
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : "Erro inesperado.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Equipe</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Convide colaboradores e vincule serviços a cada um."
              : "Colaboradores do negócio."}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openInvite}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            Convidar colaborador
          </Button>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border bg-card p-12">
            <Spinner />
          </div>
        ) : listError ? (
          <p className="rounded-2xl border bg-card p-12 text-center text-sm text-destructive">
            {listError}
          </p>
        ) : employees.length === 0 ? (
          <p className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">
            Nenhum colaborador convidado ainda.
          </p>
        ) : (
          employees.map((employee) => {
            const unlinkedServices = services.filter(
              (service) =>
                !employee.services.some((linked) => linked.id === service.id),
            );

            return (
              <div
                key={employee.id}
                className="rounded-2xl border bg-card p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{employee.name}</p>
                      <Badge variant={employee.pendingInvite ? "outline" : "default"}>
                        {employee.pendingInvite ? "Convite pendente" : "Ativo"}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {employee.email}
                    </p>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      {unlinkedServices.length > 0 && (
                        <Select
                          value=""
                          onValueChange={(value) =>
                            handleLinkService(employee, value)
                          }
                        >
                          <SelectTrigger className="w-44" size="sm">
                            <SelectValue placeholder="Vincular serviço" />
                          </SelectTrigger>
                          <SelectContent>
                            {unlinkedServices.map((service) => (
                              <SelectItem
                                key={service.id}
                                value={String(service.id)}
                              >
                                {service.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remover ${employee.name}`}
                        onClick={() => {
                          setRemoveError(null);
                          setRemoving(employee);
                        }}
                      >
                        <HugeiconsIcon icon={Delete02Icon} />
                      </Button>
                    </div>
                  )}
                </div>

                {employee.services.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {employee.services.map((service) => (
                      <Badge key={service.id} variant="secondary">
                        {service.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar colaborador</DialogTitle>
            <DialogDescription>
              O colaborador recebe um e-mail com o link para definir a senha.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="employee-name">Nome</FieldLabel>
                <Input
                  id="employee-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nome completo"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="employee-email">E-mail</FieldLabel>
                <Input
                  id="employee-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="colaborador@email.com"
                  required
                />
              </Field>
              {formError && <FieldError>{formError}</FieldError>}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Enviando…
                    </>
                  ) : (
                    "Enviar convite"
                  )}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover colaborador</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover “{removing?.name}” da equipe? Os
              horários livres dele serão apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError && (
            <p className="text-sm text-destructive">{removeError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleRemove();
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

Nota: mesmo aviso da Task 6 sobre a API dos componentes gerados (base-ui). Se o `Select` gerado não aceitar `value=""` para reset, controlar com estado local por linha ou usar `key={employee.services.length}` para forçar remount após vincular.

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Verificação na UI**

Como Ana (admin):
1. `/dashboard/team` lista Beto com badge "Ativo" (ele já aceitou o convite na Task 4) e serviços vinculados.
2. Convidar colaborador novo → aparece com "Convite pendente"; console do server imprime o invite token.
3. Vincular serviço pelo select → badge do serviço aparece.
4. Remover o colaborador recém-convidado → some da lista.
5. Como Beto (employee): vê a lista sem botões/selects.

- [ ] **Step 4: Commit**

```bash
git add web/app/dashboard/team
git commit -m "feat(web): team page with invite and service linking"
```

---

### Task 8: Página Agenda

**Files:**
- Create: `web/app/dashboard/schedule/page.tsx`

**Interfaces:**
- Consumes: `fetchAdapter`/`ApiError`, `Availability` (Task 5), componentes ui, `useAuthUser()`.
- Produces: rota `/dashboard/schedule` (só EMPLOYEE).

- [ ] **Step 1: Implementar a página**

```tsx
// web/app/dashboard/schedule/page.tsx
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Availability } from "@/lib/types";
import { useAuthUser } from "../auth-context";

function groupByDate(availabilities: Availability[]): Map<string, Availability[]> {
  const groups = new Map<string, Availability[]>();
  for (const availability of availabilities) {
    const key = availability.date.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(availability);
    groups.set(key, list);
  }
  return groups;
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export default function SchedulePage() {
  const user = useAuthUser();

  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Availability | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleting, setDeleting] = useState<Availability | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadAvailabilities = useCallback(async () => {
    try {
      const { data } = await fetchAdapter<{ availabilities: Availability[] }>({
        method: "GET",
        path: "/availabilities",
      });
      setAvailabilities(data.availabilities);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAvailabilities();
  }, [loadAvailabilities]);

  if (user.role !== "EMPLOYEE") {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <p className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">
          A agenda de horários é gerenciada por cada colaborador.
        </p>
      </div>
    );
  }

  function openCreate() {
    setEditing(null);
    setDate("");
    setStartTime("");
    setEndTime("");
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(availability: Availability) {
    setEditing(availability);
    setDate(availability.date.slice(0, 10));
    setStartTime(availability.startTime);
    setEndTime(availability.endTime);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const body = { date, startTime, endTime };

    try {
      if (editing) {
        await fetchAdapter({
          method: "PUT",
          path: `/availabilities/${editing.id}`,
          body,
        });
      } else {
        await fetchAdapter({ method: "POST", path: "/availabilities", body });
      }
      setDialogOpen(false);
      await loadAvailabilities();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteError(null);

    try {
      await fetchAdapter({
        method: "DELETE",
        path: `/availabilities/${deleting.id}`,
      });
      setDeleting(null);
      await loadAvailabilities();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Erro inesperado.");
    }
  }

  const grouped = groupByDate(availabilities);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie seus horários disponíveis para agendamento.
          </p>
        </div>
        <Button onClick={openCreate}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          Novo horário
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border bg-card p-12">
            <Spinner />
          </div>
        ) : listError ? (
          <p className="rounded-2xl border bg-card p-12 text-center text-sm text-destructive">
            {listError}
          </p>
        ) : availabilities.length === 0 ? (
          <p className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">
            Nenhum horário cadastrado ainda. Crie seus horários livres para que
            clientes possam reservar.
          </p>
        ) : (
          [...grouped.entries()].map(([day, slots]) => (
            <section key={day}>
              <h2 className="text-sm font-medium capitalize text-muted-foreground">
                {formatDate(day)}
              </h2>
              <div className="mt-2 flex flex-col gap-2">
                {slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between rounded-xl border bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium tabular-nums">
                        {slot.startTime} – {slot.endTime}
                      </p>
                      {slot.isBooked && <Badge>Reservado</Badge>}
                    </div>
                    {!slot.isBooked && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Editar horário"
                          onClick={() => openEdit(slot)}
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
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
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar horário" : "Novo horário"}</DialogTitle>
            <DialogDescription>
              Defina o dia e o intervalo em que você está disponível.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="slot-date">Data</FieldLabel>
                <Input
                  id="slot-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="slot-start">Início</FieldLabel>
                  <Input
                    id="slot-start"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="slot-end">Fim</FieldLabel>
                  <Input
                    id="slot-end"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    required
                  />
                </Field>
              </div>
              {formError && <FieldError>{formError}</FieldError>}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Salvando…
                    </>
                  ) : (
                    "Salvar"
                  )}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir horário</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir o horário de {deleting?.startTime} a {deleting?.endTime}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

Nota: o guard de role vem depois dos hooks (regra dos hooks do React — hooks não podem ser condicionais).

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Verificação na UI**

Como Beto (employee):
1. `/dashboard/schedule` lista o slot criado via curl na Task 4, agrupado por dia.
2. Criar horário novo → aparece no grupo do dia.
3. Criar horário duplicado (mesmo dia/início) → erro 409 visível no dialog.
4. Editar e excluir funcionam.
5. Item "Agenda" não aparece na sidebar da Ana (admin).

- [ ] **Step 4: Commit**

```bash
git add web/app/dashboard/schedule
git commit -m "feat(web): employee schedule page for availability management"
```

---

### Task 9: Verificação end-to-end, documentação e TASKS.md

**Files:**
- Create: `docs/2026-07-24-servicos-equipe-agenda.md`
- Modify: `server/TASKS.md` (checkboxes 3.2, 3.3, 3.4 — arquivo gitignorado, não commitar)

**Interfaces:**
- Consumes: tudo das Tasks 1–8.
- Produces: fluxo completo verificado + doc de estudo.

- [ ] **Step 1: Fluxo end-to-end completo no browser**

Com server e web rodando, do zero (pode usar um business novo para não depender de estado):
1. Superadmin loga → cria business via curl (UI de criação de business ainda não existe) → invite token no console.
2. `/accept-invite?token=...` → admin define senha → cai no dashboard.
3. Admin cria 2 serviços em `/dashboard/services`.
4. Admin convida employee em `/dashboard/team` e vincula 1 serviço.
5. Employee aceita convite (token no console) → define senha → `/dashboard/schedule` → cria 2 horários.
6. Conferir isolamento: admin não vê "Agenda" na sidebar; employee vê "Agenda", mas não tem botões de ação em Serviços/Equipe.
7. Conferir no banco (`cd server && npm run db:studio`): services, employee, employee_service e availabilities criados com os `businessId`/`employeeId` corretos.

Expected: todos os passos acima funcionam sem erro no console do browser nem do server.

- [ ] **Step 2: Marcar checkboxes no `server/TASKS.md`**

Marcar `[x]` em: 3.2 (todas as 4 sub-rotas), 3.3 (todas as 4), 3.4 (todas as 4) e nos itens correspondentes dos Critérios de Conclusão que passarem a ser verdade ("Admin consegue completar o cadastro, criar Services e convidar Employees", "Employee consegue gerenciar sua própria Availability"). Não commitar (gitignorado).

- [ ] **Step 3: Escrever o doc explicativo**

Criar `docs/2026-07-24-servicos-equipe-agenda.md`, em português, voltado a estudo de arquitetura. Estrutura obrigatória (cada seção com o conteúdo indicado, escrito por extenso — sem placeholders):

1. **O que foi construído** — resumo das três páginas, dos três CRUDs e do adapter, com links para os arquivos.
2. **O padrão adapter no frontend** — por que centralizar as chamadas (um único lugar para baseURL, headers, token e tratamento de erro); anatomia do `fetchAdapter` (assinatura, injeção de token, `ApiError`); comparação curta com o `lib/api.ts` anterior (funções por método vs. objeto de configuração) e com a versão axios de referência.
3. **O fluxo de uma requisição no backend** — passo a passo de um `POST /services`: route (validação JSON Schema + `authenticate` + `authorize`) → controller (extrai dados da request, chama service) → service (regras de negócio: escopo, conflitos) → repository (Prisma). Por que cada camada existe e o que NÃO deve morar em cada uma.
4. **Decisões de design e por quê** — (a) escopo por `businessId` do JWT e nunca do cliente; (b) 404 em vez de 403 para recurso de outro tenant (não vazar existência); (c) 409 para recursos "reservados" (service com booking, slot reservado); (d) convite reutilizando o fluxo do admin (mesma tabela User, `inviteToken`); (e) `pendingInvite` derivado de `password === null`; (f) vínculo employee↔service idempotente via upsert.
5. **O que ficou de fora e virá depois** — bookings (Fase 3.5), client view pública (Fase 4), realtime/e-mails de confirmação/upload (Fase 5), testes automatizados (5.5).

- [ ] **Step 4: Commit final**

```bash
git add docs/2026-07-24-servicos-equipe-agenda.md
git commit -m "docs: explain services/team/schedule implementation and adapter pattern"
```

---

## Self-Review (executada na escrita do plano)

- **Cobertura da spec:** adapter (Task 1), Fase 3.2 (Task 2), 3.3 (Task 3), 3.4 (Task 4), sidebar/roles/tipos (Task 5), páginas (Tasks 6–8), docs + TASKS.md + E2E (Task 9). Sem lacunas.
- **Placeholders:** nenhum — todo step de código tem o código completo; o doc da Task 9 tem estrutura e conteúdo obrigatório definidos.
- **Consistência de tipos:** `fetchAdapter<T>` retorna `{ data, status, statusText }` em todos os usos; respostas da API (`{ services }`, `{ employees }`, `{ availabilities }`, `{ service }`, `{ employee }`, `{ availability }`) batem entre controllers (Tasks 2–4) e páginas (Tasks 6–8); `requireBusinessId` definido na Task 2 e usado nas Tasks 2–3; `price` tipado como `string` no web (Decimal serializado) e convertido com `Number()` no submit/format.
