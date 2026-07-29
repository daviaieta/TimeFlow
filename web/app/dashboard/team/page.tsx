"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { Employee, EmployeeServiceLink, Service } from "@/lib/types";
import { useAuthUser } from "../auth-context";
import { EmployeeCard } from "./employee-card";

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
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  const [linkError, setLinkError] = useState<{
    employeeId: number;
    message: string;
  } | null>(null);
  // Guardado por colaborador, não como booleano global: travar a tela inteira
  // porque um card está salvando seria pior que não dar retorno nenhum.
  const [linkingId, setLinkingId] = useState<number | null>(null);

  const [unlinking, setUnlinking] = useState<{
    employee: Employee;
    service: EmployeeServiceLink;
  } | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [unlinkSubmitting, setUnlinkSubmitting] = useState(false);

  const loadData = useCallback(() => {
    return Promise.all([
      fetchAdapter<{ employees: Employee[] }>({
        method: "GET",
        path: "/employees",
      }),
      fetchAdapter<{ services: Service[] }>({
        method: "GET",
        path: "/services",
      }),
    ])
      .then(([employeesRes, servicesRes]) => {
        setEmployees(employeesRes.data.employees);
        setServices(servicesRes.data.services);
        setListError(null);
      })
      .catch((err) => {
        setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
      })
      .finally(() => {
        setLoading(false);
      });
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
    setLinkError(null);
    setLinkingId(employee.id);

    try {
      await fetchAdapter({
        method: "POST",
        path: `/employees/${employee.id}/services`,
        body: { serviceId: Number(serviceId) },
      });
      await loadData();
    } catch (err) {
      setLinkError({
        employeeId: employee.id,
        message: err instanceof ApiError ? err.message : "Erro inesperado.",
      });
    } finally {
      setLinkingId(null);
    }
  }

  async function handleRemove() {
    if (!removing) return;
    setRemoveError(null);
    setRemoveSubmitting(true);

    try {
      await fetchAdapter({ method: "DELETE", path: `/employees/${removing.id}` });
      setRemoving(null);
      await loadData();
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setRemoveSubmitting(false);
    }
  }

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

  const idle = employees.filter(
    (employee) => employee.services.length === 0,
  ).length;

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Empilha no celular: lado a lado, "Convidar colaborador" espremeria o
          título até ele quebrar em três linhas. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Equipe</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {/* Mesma regra da tela de serviços: a contagem só aparece quando
                existe contagem de verdade. */}
            {loading || listError
              ? isAdmin
                ? "Convide colaboradores e vincule serviços a cada um."
                : "Colaboradores do negócio."
              : `${employees.length} ${employees.length === 1 ? "colaborador" : "colaboradores"}` +
                (idle > 0 ? ` · ${idle} sem serviço vinculado` : "")}
          </p>
        </div>
        {isAdmin && (
          <Button className="w-full sm:w-auto" onClick={openInvite}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            Convidar colaborador
          </Button>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {loading ? (
          <>
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </>
        ) : listError ? (
          <p className="rounded-2xl border bg-card p-12 text-center text-sm text-destructive">
            {listError}
          </p>
        ) : employees.length === 0 ? (
          <div className="rounded-2xl border bg-card shadow-sm">
            <EmptyState
              icon={UserGroupIcon}
              title="Nenhum colaborador convidado ainda"
              description={
                isAdmin
                  ? "Convide quem atende no seu negócio. Cada um recebe um e-mail para definir a senha e passa a gerenciar a própria agenda."
                  : "O administrador ainda não convidou ninguém para a equipe."
              }
              action={
                isAdmin ? (
                  <Button size="sm" onClick={openInvite}>
                    <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
                    Convidar colaborador
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          employees.map((employee) => (
            <EmployeeCard
              key={employee.id}
              employee={employee}
              services={services}
              isAdmin={isAdmin}
              linking={linkingId === employee.id}
              linkError={
                linkError?.employeeId === employee.id ? linkError.message : null
              }
              onLink={handleLinkService}
              onUnlink={(target, service) => {
                setUnlinkError(null);
                setUnlinking({ employee: target, service });
              }}
              onRemove={(target) => {
                setRemoveError(null);
                setRemoving(target);
              }}
            />
          ))
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
            <AlertDialogCancel disabled={removeSubmitting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeSubmitting}
              onClick={() => {
                void handleRemove();
              }}
            >
              {removeSubmitting ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Removendo…
                </>
              ) : (
                "Remover"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
  );
}
