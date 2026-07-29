"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Scissor01Icon } from "@hugeicons/core-free-icons";
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
import { formatPriceInput, parsePrice } from "@/lib/money";
import { Service } from "@/lib/types";
import { useAuthUser } from "../auth-context";
import { ServiceList } from "./service-list";

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
    setPrice(formatPriceInput(service.price));
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // O campo é texto para aceitar vírgula, então a validação de formato é
    // nossa — o browser não faz mais nada por ele.
    const parsedPrice = parsePrice(price);
    if (parsedPrice === null) {
      setFormError("Informe um preço válido, como 45,90.");
      return;
    }

    setSubmitting(true);

    const body = { name, duration: Number(duration), price: parsedPrice };

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

  const orphans = services.filter(
    (service) => service.employees.length === 0,
  ).length;

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Empilha no celular: lado a lado, o botão espremeria o título. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Serviços</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {/* A contagem só entra depois do carregamento: "0 serviços"
                enquanto a lista ainda vem seria mentira por meio segundo. */}
            {loading || listError
              ? isAdmin
                ? "Gerencie os serviços oferecidos pelo seu negócio."
                : "Serviços oferecidos pelo negócio."
              : `${services.length} ${services.length === 1 ? "serviço" : "serviços"}` +
                (orphans > 0 ? ` · ${orphans} sem profissional vinculado` : "")}
          </p>
        </div>
        {isAdmin && (
          <Button className="w-full sm:w-auto" onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            Novo serviço
          </Button>
        )}
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border bg-card shadow-sm">
        {loading ? (
          // Skeleton no lugar do spinner: mesma linguagem de carregamento do
          // dashboard, e já reserva a altura que a lista vai ocupar.
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : listError ? (
          <p className="p-12 text-center text-sm text-destructive">{listError}</p>
        ) : services.length === 0 ? (
          <EmptyState
            icon={Scissor01Icon}
            title="Nenhum serviço cadastrado ainda"
            description={
              isAdmin
                ? "Cadastre o que o seu negócio oferece. Sem serviço, ninguém consegue reservar pela página pública."
                : "O administrador ainda não cadastrou os serviços do negócio."
            }
            action={
              isAdmin ? (
                <Button size="sm" onClick={openCreate}>
                  <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
                  Cadastrar serviço
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ServiceList
            services={services}
            isAdmin={isAdmin}
            onEdit={openEdit}
            onDelete={(service) => {
              setDeleteError(null);
              setDeleting(service);
            }}
          />
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
                {/* Texto, não number: o teclado pt-BR entrega vírgula e o
                    type="number" a descarta em silêncio. inputMode mantém o
                    teclado numérico no celular. */}
                <Input
                  id="service-price"
                  type="text"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="45,90"
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
            {/* O servidor recusa excluir serviço que já tem reserva. Dizer
                isso aqui evita que o erro só apareça depois do clique. */}
            <AlertDialogDescription>
              Tem certeza que deseja excluir “{deleting?.name}”? Ele sai da
              página pública e dos vínculos da equipe, e a ação não pode ser
              desfeita. Um serviço que já tem reservas não pode ser excluído.
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
