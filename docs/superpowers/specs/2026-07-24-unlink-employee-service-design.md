# Desvincular serviço de colaborador — design

**Data:** 2026-07-24
**Branch:** a definir na implementação
**Contexto:** completa o RF09 do `server/PRD.md` ("Admin deve poder vincular/desvincular
um Employee a um ou mais Services") — o vínculo (`POST /employees/:id/services`) foi
implementado na Fase 3.3 do `server/TASKS.md`, o desvínculo ficou de fora e é o escopo
desta feature.

## Por que não precisa de checagem de conflito (409)

`Availability` não tem `serviceId` no schema Prisma — a disponibilidade de um
colaborador não está amarrada a um serviço específico. `Booking` referencia `Service` e
`Availability` diretamente, nunca `EmployeeService`. Logo, remover uma linha de
`EmployeeService` não pode orfanizar nenhum agendamento ou disponibilidade existente.
Diferente de `deleteEmployee` (bloqueia se houver `Availability` com `isBooked = true`)
e `deleteService` (bloqueia se houver `Booking`), desvincular um serviço de um
colaborador é uma operação sem efeito colateral em outras tabelas — não precisa de
regra de negócio além de confirmar que o colaborador pertence ao `businessId` do token.

## Backend

Segue o fluxo padrão `route → controller → service → repository` já usado em
`linkService`.

**`server/src/repositories/employeeRepository.ts`** — novo método:

```ts
unlinkService(employeeId: number, serviceId: number) {
  return prisma.employeeService.deleteMany({ where: { employeeId, serviceId } });
},
```

Uso `deleteMany` (não `delete`) para manter a operação idempotente, espelhando o
`upsert` do `linkService` documentado em `docs/2026-07-24-servicos-equipe-agenda.md`
seção 4(f): chamar a rota duas vezes, ou desvincular um par que já não existe, não deve
gerar erro (nem um 404 de "vínculo não encontrado" — o resultado desejado, "esse par não
está mais vinculado", já é verdade).

**`server/src/services/employeeService.ts`** — novo método:

```ts
async unlinkService(businessId: number, employeeId: number, serviceId: number) {
  await findOwnedEmployee(businessId, employeeId);
  await employeeRepository.unlinkService(employeeId, serviceId);
},
```

Reaproveita `findOwnedEmployee` (já usado por `deleteEmployee` e `linkService`) para
garantir 404 quando o colaborador não existe ou não pertence a este `businessId`. Não é
necessário validar que `serviceId` pertence ao mesmo `businessId`: a query de delete é
escopada por `employeeId` (já comprovadamente deste tenant) e um `serviceId` de outro
tenant nunca teria uma linha em `EmployeeService` para este `employeeId` — não há dado
para vazar nem para apagar indevidamente.

**`server/src/controllers/employeeController.ts`** — novo handler:

```ts
export interface UnlinkServiceParams {
  id: number;
  serviceId: number;
}

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

**`server/src/routes/employeeRoutes.ts`** — nova rota:

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

app.delete<{ Params: UnlinkServiceParams }>(
  "/employees/:id/services/:serviceId",
  {
    schema: unlinkServiceParamsSchema,
    preHandler: [authenticate, authorize(Role.ADMIN)],
  },
  unlinkService,
);
```

Mesma autorização do link (`Role.ADMIN` apenas).

Nenhuma migration é necessária — `EmployeeService` já existe com PK composta
`[employeeId, serviceId]`.

## Frontend (`web/app/dashboard/team/page.tsx`)

**Decisão de UX confirmada com o usuário:** desvincular pede confirmação via
`AlertDialog`, o mesmo padrão já usado para remover colaborador (`removing`/
`handleRemove`), não um clique direto sem confirmação.

**Novo estado:**

```ts
const [unlinking, setUnlinking] = useState<{ employee: Employee; service: EmployeeServiceLink } | null>(null);
const [unlinkError, setUnlinkError] = useState<string | null>(null);
const [unlinkSubmitting, setUnlinkSubmitting] = useState(false);
```

**Novo handler**, espelhando `handleRemove`:

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

**UI — badge de serviço vinculado** ganha um botão "x" (`Cancel01Icon` do
`@hugeicons/core-free-icons`, mesmo pacote já usado para `Add01Icon`/`Delete02Icon`),
visível apenas quando `isAdmin`:

```tsx
{employee.services.length > 0 && (
  <div className="mt-3 flex flex-wrap gap-1.5">
    {employee.services.map((service) => (
      <Badge key={service.id} variant="secondary" className={isAdmin ? "gap-1 pr-1" : undefined}>
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

**Novo `AlertDialog`**, adicionado ao final do JSX junto ao de remover colaborador,
seguindo o mesmo padrão de `open`/`onOpenChange`/erro inline/spinner no botão:

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
    {unlinkError && <p className="text-sm text-destructive">{unlinkError}</p>}
    <AlertDialogFooter>
      <AlertDialogCancel disabled={unlinkSubmitting}>Cancelar</AlertDialogCancel>
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

Nenhuma mudança em `web/lib/types.ts` é necessária — `EmployeeServiceLink` já tem `id`
e `name`, suficiente para o dialog e a chamada.

## Fora de escopo

- Nenhuma mudança em `Availability`/`Booking`.
- Nenhuma alteração no fluxo de vínculo (`linkService`) existente.
- Testes automatizados continuam fora de escopo neste projeto (verificação manual via
  curl + navegador, como as demais features desta fase).
