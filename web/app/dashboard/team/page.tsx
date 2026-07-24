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
  SelectGroup,
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
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  const [linkError, setLinkError] = useState<{
    employeeId: number;
    message: string;
  } | null>(null);

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
                          onValueChange={(value) => {
                            if (value) handleLinkService(employee, value);
                          }}
                        >
                          <SelectTrigger className="w-44" size="sm">
                            <SelectValue placeholder="Vincular serviço" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {unlinkedServices.map((service) => (
                                <SelectItem
                                  key={service.id}
                                  value={String(service.id)}
                                >
                                  {service.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
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

                {linkError?.employeeId === employee.id && (
                  <p className="mt-2 text-sm text-destructive">
                    {linkError.message}
                  </p>
                )}

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
    </div>
  );
}
