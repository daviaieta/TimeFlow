"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, TagIcon } from "@hugeicons/core-free-icons";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { formatDate, isValidTagColor } from "@/lib/crm";
import { CustomerTag } from "@/lib/types";
import { useAuthUser } from "../auth-context";

const DEFAULT_COLOR = "#4f46e5";

// Vocabulário de etiquetas do negócio. Criar e excluir é do ADMIN; aplicar em
// cliente é de qualquer um da equipe, e isso acontece no prontuário.

export default function TagsPage() {
  const user = useAuthUser();
  const isAdmin = user.role === "ADMIN";

  const [tags, setTags] = useState<CustomerTag[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleting, setDeleting] = useState<CustomerTag | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(() => {
    return fetchAdapter<{ tags: CustomerTag[] }>({ method: "GET", path: "/tags" })
      .then(({ data }) => {
        setTags(data.tags);
        setListError(null);
      })
      .catch((err) => {
        setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setName("");
    setColor(DEFAULT_COLOR);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (name.trim() === "") {
      setFormError("Dê um nome à etiqueta.");
      return;
    }
    // O seletor de cor do browser só produz hex, mas a validação fica aqui
    // porque o campo aceita digitação em alguns navegadores.
    if (!isValidTagColor(color)) {
      setFormError("A cor precisa ser um hexadecimal como #1a2b3c.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await fetchAdapter({
        method: "POST",
        path: "/tags",
        body: { name: name.trim(), color },
      });
      setDialogOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;

    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await fetchAdapter({ method: "DELETE", path: `/tags/${deleting.id}` });
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Etiquetas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rótulos para agrupar clientes — “VIP”, “inadimplente”, “indicação”.
            Aplique no prontuário de cada cliente.
          </p>
        </div>
        {isAdmin && (
          <Button className="w-full sm:w-auto" onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            Nova etiqueta
          </Button>
        )}
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border bg-card shadow-sm">
        {tags === null ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : listError ? (
          <p className="p-12 text-center text-sm text-destructive">{listError}</p>
        ) : tags.length === 0 ? (
          <EmptyState
            icon={TagIcon}
            title="Nenhuma etiqueta ainda"
            description={
              isAdmin
                ? "Crie a primeira para começar a agrupar a sua carteira de clientes."
                : "O administrador ainda não criou etiquetas."
            }
            action={
              isAdmin ? (
                <Button size="sm" onClick={openCreate}>
                  <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
                  Criar etiqueta
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full border"
                    style={{ backgroundColor: tag.color ?? "transparent" }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{tag.name}</p>
                    <p className="text-xs text-muted-foreground">
                      criada em {formatDate(tag.createdAt)}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleting(tag);
                    }}
                  >
                    Excluir
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova etiqueta</DialogTitle>
            <DialogDescription>
              O nome é único dentro do seu negócio.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="tag-name">Nome</FieldLabel>
                <Input
                  id="tag-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: VIP"
                  maxLength={32}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="tag-color">Cor</FieldLabel>
                <div className="flex items-center gap-3">
                  <input
                    id="tag-color"
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="size-10 cursor-pointer rounded-lg border bg-transparent"
                  />
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {color}
                  </span>
                </div>
                <FieldDescription>
                  Só apresentação: é o ponto colorido ao lado do nome.
                </FieldDescription>
              </Field>

              {formError && <FieldError>{formError}</FieldError>}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={submitting}
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
                    "Criar"
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
            <AlertDialogTitle>Excluir etiqueta</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.name}” sai de todos os clientes que a tinham. O
              histórico deles não muda, e a ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => {
                void handleDelete();
              }}
            >
              {deleteBusy ? (
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
