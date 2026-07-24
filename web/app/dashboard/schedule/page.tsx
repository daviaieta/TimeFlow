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
  const [deletingSubmitting, setDeletingSubmitting] = useState(false);

  const loadAvailabilities = useCallback(() => {
    return fetchAdapter<{ availabilities: Availability[] }>({
      method: "GET",
      path: "/availabilities",
    })
      .then(({ data }) => {
        setAvailabilities(data.availabilities);
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
    setDeletingSubmitting(true);

    try {
      await fetchAdapter({
        method: "DELETE",
        path: `/availabilities/${deleting.id}`,
      });
      setDeleting(null);
      await loadAvailabilities();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setDeletingSubmitting(false);
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
                          size="icon-sm"
                          aria-label="Editar horário"
                          onClick={() => openEdit(slot)}
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
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
            <AlertDialogCancel disabled={deletingSubmitting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingSubmitting}
              onClick={() => {
                void handleDelete();
              }}
            >
              {deletingSubmitting ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Excluindo…
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
