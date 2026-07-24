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
  const [deletingSubmitting, setDeletingSubmitting] = useState(false);

  const loadServices = useCallback(() => {
    return fetchAdapter<{ services: Service[] }>({
      method: "GET",
      path: "/services",
    })
      .then(({ data }) => {
        setServices(data.services);
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
    setDeletingSubmitting(true);

    try {
      await fetchAdapter({ method: "DELETE", path: `/services/${deleting.id}` });
      setDeleting(null);
      await loadServices();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setDeletingSubmitting(false);
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
                          size="icon-sm"
                          aria-label={`Editar ${service.name}`}
                          onClick={() => openEdit(service)}
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
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
