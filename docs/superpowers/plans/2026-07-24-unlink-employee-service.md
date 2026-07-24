# Desvincular Serviço de Colaborador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `DELETE /employees/:id/services/:serviceId` on the backend and a confirm-then-remove UI on the Team page, completing RF09 of `server/PRD.md` ("Admin deve poder vincular/desvincular um Employee a um ou mais Services").

**Architecture:** Follows the existing `route → controller → service → repository` layering used by every other endpoint in `server/src`. No schema/migration changes — `EmployeeService` already has the composite PK needed. Frontend adds an "x" affordance to the existing service `Badge` on `web/app/dashboard/team/page.tsx`, gated behind a confirmation `AlertDialog` that mirrors the already-shipped "remove employee" dialog on the same page.

**Tech Stack:** Fastify + Prisma + TypeScript (server), Next.js + React + shadcn/ui + Hugeicons (web). No automated test framework exists in this project (`server/package.json` has no test script) — verification is manual via curl (backend) and the browser (frontend), matching how every prior phase in `server/TASKS.md` was verified.

## Global Constraints

- New/changed Fastify route schemas must set `additionalProperties: false` (see `[[project_hardening_followups]]` memory / recent hardening commit `086dd1e`).
- Only `Role.ADMIN` may call the unlink endpoint (matches `linkService`'s authorization).
- The unlink operation must be idempotent: calling it twice, or on a pair that was never linked, must return `204` — never a `404`/`409` for "link not found."
- Do not add a conflict/409 check for existing bookings or availabilities — confirmed in the design spec that `Availability` has no `serviceId`, so unlinking cannot orphan any booking.
- Use path parameters (`:id`, `:serviceId`), not a request body, for the DELETE route — `serviceId` identifies which sub-resource of the employee's service collection to remove.

---

### Task 1: Backend — `DELETE /employees/:id/services/:serviceId`

**Files:**
- Modify: `server/src/repositories/employeeRepository.ts`
- Modify: `server/src/services/employeeService.ts`
- Modify: `server/src/controllers/employeeController.ts`
- Modify: `server/src/routes/employeeRoutes.ts`

**Interfaces:**
- Consumes: `findOwnedEmployee(businessId: number, id: number): Promise<User>` (private helper already defined in `server/src/services/employeeService.ts`, throws `NotFoundError` if not found/not owned). `requireBusinessId(request): number` from `server/src/lib/requireBusinessId.ts`.
- Produces: `employeeRepository.unlinkService(employeeId: number, serviceId: number): Promise<Prisma.BatchPayload>`. `employeeService.unlinkService(businessId: number, employeeId: number, serviceId: number): Promise<void>`. Controller export `unlinkService`. Params type `UnlinkServiceParams { id: number; serviceId: number }` exported from `employeeController.ts` (mirrors the existing `EmployeeParams` / `LinkServiceBody` exports used by `employeeRoutes.ts`).

- [ ] **Step 1: Add `unlinkService` to the repository**

Open `server/src/repositories/employeeRepository.ts` and add a new method to the exported `employeeRepository` object, right after `linkService`:

```ts
  unlinkService(employeeId: number, serviceId: number) {
    return prisma.employeeService.deleteMany({
      where: { employeeId, serviceId },
    });
  },
```

`deleteMany` (not `delete`) is deliberate: `delete` throws `P2025` if the row doesn't exist, which would make the endpoint non-idempotent. `deleteMany` deletes 0-or-1 rows silently either way.

- [ ] **Step 2: Add `unlinkService` to the service layer**

Open `server/src/services/employeeService.ts` and add a new method to the exported `employeeService` object, right after `linkService`:

```ts
  async unlinkService(businessId: number, employeeId: number, serviceId: number) {
    await findOwnedEmployee(businessId, employeeId);
    await employeeRepository.unlinkService(employeeId, serviceId);
  },
```

No `serviceRepository` lookup is needed here (unlike `linkService`) — see Global Constraints: there's nothing to validate that a scoped `deleteMany` on an already-owned `employeeId` can't already guarantee.

- [ ] **Step 3: Add the controller handler**

Open `server/src/controllers/employeeController.ts`. Add a new exported interface next to `EmployeeParams`:

```ts
export interface UnlinkServiceParams {
  id: number;
  serviceId: number;
}
```

Add a new exported function after `linkService`:

```ts
export async function unlinkService(
  request: FastifyRequest<{ Params: UnlinkServiceParams }>,
  reply: FastifyReply,
): Promise<void> {
  await employeeService.unlinkService(
    requireBusinessId(request),
    request.params.id,
    request.params.serviceId,
  );
  reply.status(204).send();
}
```

- [ ] **Step 4: Wire the route**

Open `server/src/routes/employeeRoutes.ts`. Update the import block to include the new controller symbols:

```ts
import {
  createEmployee,
  deleteEmployee,
  linkService,
  listEmployees,
  unlinkService,
  CreateEmployeeBody,
  EmployeeParams,
  LinkServiceBody,
  UnlinkServiceParams,
} from "../controllers/employeeController";
```

Add a new schema after `linkServiceSchema`:

```ts
const unlinkServiceParamsSchema = {
  params: {
    type: "object",
    required: ["id", "serviceId"],
    additionalProperties: false,
    properties: {
      id: { type: "integer" },
      serviceId: { type: "integer" },
    },
  },
};
```

Add the route registration at the end of `employeeRoutes`, after the existing `app.post(".../services", ...)` block:

```ts
  app.delete<{ Params: UnlinkServiceParams }>(
    "/employees/:id/services/:serviceId",
    {
      schema: unlinkServiceParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    unlinkService,
  );
```

- [ ] **Step 5: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification via curl**

Start the server: `cd server && npm run dev` (leave running in background).

Get an ADMIN JWT by logging in with a seeded admin account (use whatever admin credentials already exist in your dev DB from prior phases), and get a valid `employeeId`/`serviceId` pair that's currently linked (via `GET /employees` — look for an entry whose `services` array is non-empty; if none exists, link one first with `POST /employees/:id/services`).

```bash
TOKEN="<admin jwt>"
EMPLOYEE_ID=<id>
SERVICE_ID=<id>

# Happy path: unlink an existing link
curl -i -X DELETE "http://localhost:3333/employees/$EMPLOYEE_ID/services/$SERVICE_ID" \
  -H "Authorization: Bearer $TOKEN"
```
Expected: `204 No Content`, empty body.

```bash
# Verify it's actually gone
curl -s "http://localhost:3333/employees" -H "Authorization: Bearer $TOKEN" | jq ".employees[] | select(.id==$EMPLOYEE_ID) | .services"
```
Expected: the service no longer appears in the array.

```bash
# Idempotency: call it again on the same (now-unlinked) pair
curl -i -X DELETE "http://localhost:3333/employees/$EMPLOYEE_ID/services/$SERVICE_ID" \
  -H "Authorization: Bearer $TOKEN"
```
Expected: `204 No Content` again — not a `404`.

```bash
# Wrong-tenant / nonexistent employee
curl -i -X DELETE "http://localhost:3333/employees/999999/services/$SERVICE_ID" \
  -H "Authorization: Bearer $TOKEN"
```
Expected: `404`, body `{"message":"Employee not found"}` (or whatever `NotFoundError`'s message format is — matches the existing 404 shape used by `deleteEmployee`).

```bash
# EMPLOYEE role forbidden
EMPLOYEE_TOKEN="<employee jwt>"
curl -i -X DELETE "http://localhost:3333/employees/$EMPLOYEE_ID/services/$SERVICE_ID" \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN"
```
Expected: `403`.

- [ ] **Step 7: Commit**

```bash
git add server/src/repositories/employeeRepository.ts server/src/services/employeeService.ts server/src/controllers/employeeController.ts server/src/routes/employeeRoutes.ts
git commit -m "feat(server): add DELETE /employees/:id/services/:serviceId to unlink a service"
```

---

### Task 2: Frontend — unlink UI on the Team page

**Files:**
- Modify: `web/app/dashboard/team/page.tsx`

**Interfaces:**
- Consumes: `fetchAdapter<T>({ method, path, body? }): Promise<{ data: T; status; statusText }>` and `ApiError` from `web/adapters/fetchAdapter.ts` (already imported in this file). `Employee`, `EmployeeServiceLink`, `Service` types from `web/lib/types.ts`. Backend endpoint `DELETE /employees/:id/services/:serviceId` from Task 1.
- Produces: nothing consumed elsewhere — this is a leaf UI change.

- [ ] **Step 1: Import the new icon and `EmployeeServiceLink` type**

In `web/app/dashboard/team/page.tsx`, update the icon import (line 5):

```ts
import { Add01Icon, Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
```

Update the type import (line 38):

```ts
import { Employee, EmployeeServiceLink, Service } from "@/lib/types";
```

- [ ] **Step 2: Add unlink state**

After the existing `linkError` state declaration (around line 60-63), add:

```ts
  const [unlinking, setUnlinking] = useState<{
    employee: Employee;
    service: EmployeeServiceLink;
  } | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [unlinkSubmitting, setUnlinkSubmitting] = useState(false);
```

- [ ] **Step 3: Add the `handleUnlink` function**

After `handleRemove` (around line 138-152), add:

```ts
  async function handleUnlink() {
    if (!unlinking) return;
    setUnlinkError(null);
    setUnlinkSubmitting(true);

    try {
      await fetchAdapter({
        method: "DELETE",
        path: `/employees/${unlinking.employee.id}/services/${unlinking.service.id}`,
      });
      setUnlinking(null);
      await loadData();
    } catch (err) {
      setUnlinkError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setUnlinkSubmitting(false);
    }
  }
```

- [ ] **Step 4: Add the "x" affordance to each linked-service badge**

Replace the existing linked-services block (lines 258-266):

```tsx
                {employee.services.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {employee.services.map((service) => (
                      <Badge key={service.id} variant="secondary">
                        {service.name}
                      </Badge>
                    ))}
                  </div>
                )}
```

with:

```tsx
                {employee.services.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {employee.services.map((service) => (
                      <Badge
                        key={service.id}
                        variant="secondary"
                        className={isAdmin ? "gap-1 pr-1" : undefined}
                      >
                        {service.name}
                        {isAdmin && (
                          <button
                            type="button"
                            aria-label={`Desvincular ${service.name}`}
                            onClick={() => {
                              setUnlinkError(null);
                              setUnlinking({ employee, service });
                            }}
                          >
                            <HugeiconsIcon icon={Cancel01Icon} size={12} />
                          </button>
                        )}
                      </Badge>
                    ))}
                  </div>
                )}
```

- [ ] **Step 5: Add the confirm `AlertDialog`**

After the existing "Remover colaborador" `AlertDialog` closes (after line 368, before the closing `</div>` of the component at line 369), add:

```tsx
      <AlertDialog
        open={unlinking !== null}
        onOpenChange={(open) => {
          if (!open) setUnlinking(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desvincular “{unlinking?.service.name}” de “
              {unlinking?.employee.name}”?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {unlinkError && (
            <p className="text-sm text-destructive">{unlinkError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinkSubmitting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={unlinkSubmitting}
              onClick={() => {
                void handleUnlink();
              }}
            >
              {unlinkSubmitting ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Desvinculando…
                </>
              ) : (
                "Desvincular"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 6: Typecheck and lint**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

Run: `cd web && npx eslint app/dashboard/team/page.tsx`
Expected: no errors.

- [ ] **Step 7: Manual verification in the browser**

Start both servers: `cd server && npm run dev` and `cd web && npm run dev` (both in background/separate terminals). Backend Task 1 must be running for this step.

1. Log in as an ADMIN in the browser, go to `/dashboard/team`.
2. Confirm each linked-service `Badge` now shows a small "x" and the "Vincular serviço" `Select` still works unaffected.
3. Click the "x" on a linked service — confirm the "Desvincular serviço" `AlertDialog` opens with the correct employee/service names interpolated.
4. Click "Cancelar" — confirm the dialog closes and the badge is unchanged (nothing was removed).
5. Click the "x" again, then click "Desvincular" — confirm the button shows the spinner + "Desvinculando…", the dialog closes on success, and the badge is gone from the card without a full page reload glitch.
6. Reload the page — confirm the removal persisted (badge still gone).
7. Log in as EMPLOYEE for the same business — confirm no "x" appears on any badge (read-only view, `isAdmin` gate).
8. With dev tools network tab open, trigger an unlink while offline (or stop the backend server) — confirm the error message renders inside the dialog (`unlinkError`) and the dialog stays open rather than silently closing.

- [ ] **Step 8: Commit**

```bash
git add web/app/dashboard/team/page.tsx
git commit -m "feat(web): add unlink-service confirm dialog to Team page"
```

---

## Post-implementation

After both tasks are verified, update `server/TASKS.md` line 43 to reflect the completed unlink endpoint (it currently only lists `POST /employees/:id/services`):

```diff
- - [x] `POST /employees/:id/services` (vincula a um Service)
+ - [x] `POST /employees/:id/services` (vincula a um Service)
+ - [x] `DELETE /employees/:id/services/:serviceId` (desvincula um Service)
```

`server/TASKS.md` is gitignored (per project convention — see PRD/TASKS docs), so this edit does not need a commit; it's a personal tracking file.
