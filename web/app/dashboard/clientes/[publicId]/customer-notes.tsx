"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/dashboard/panel";
import { formatDateTime } from "@/lib/crm";
import { CustomerNote } from "@/lib/types";
import { useAuthUser } from "../../auth-context";

// Observações da equipe sobre o cliente. Quem escreveu pode editar e apagar;
// o ADMIN pode mexer em qualquer uma. A regra de verdade é do servidor — aqui
// só se esconde o botão que ele recusaria.

export function CustomerNotes({ publicId }: { publicId: string }) {
  const user = useAuthUser();

  const [notes, setNotes] = useState<CustomerNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const [deleting, setDeleting] = useState<CustomerNote | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(() => {
    return fetchAdapter<{ notes: CustomerNote[] }>({
      method: "GET",
      path: `/customers/${publicId}/notes`,
    })
      .then(({ data }) => {
        setNotes(data.notes);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, [publicId]);

  useEffect(() => {
    load();
  }, [load]);

  function canManage(note: CustomerNote): boolean {
    return user.role === "ADMIN" || note.author?.id === user.id;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim() === "") return;

    setSubmitting(true);
    setError(null);
    try {
      await fetchAdapter({
        method: "POST",
        path: `/customers/${publicId}/notes`,
        body: { body },
      });
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(noteId: number) {
    if (editingBody.trim() === "") return;

    setSubmitting(true);
    setError(null);
    try {
      await fetchAdapter({
        method: "PATCH",
        path: `/customers/${publicId}/notes/${noteId}`,
        body: { body: editingBody },
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;

    setDeleteBusy(true);
    setError(null);
    try {
      await fetchAdapter({
        method: "DELETE",
        path: `/customers/${publicId}/notes/${deleting.id}`,
      });
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <Panel
      title="Observações"
      description="Visível só para a equipe. O cliente nunca lê isto."
    >
      <form onSubmit={handleCreate} className="flex flex-col gap-2">
        <label htmlFor="note-body" className="sr-only">
          Nova observação
        </label>
        <Textarea
          id="note-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Ex.: prefere atendimento no fim da tarde."
          maxLength={5000}
          rows={3}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={submitting || body.trim() === ""}>
            {submitting ? (
              <>
                <Spinner data-icon="inline-start" />
                Salvando…
              </>
            ) : (
              "Adicionar"
            )}
          </Button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-5">
        {notes === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma observação ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl border p-3">
                {editingId === note.id ? (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      value={editingBody}
                      onChange={(event) => setEditingBody(event.target.value)}
                      maxLength={5000}
                      rows={3}
                      aria-label="Editar observação"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        disabled={submitting}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleUpdate(note.id)}
                        disabled={submitting || editingBody.trim() === ""}
                      >
                        Salvar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {note.author?.name ?? "Equipe"} ·{" "}
                        {formatDateTime(note.createdAt)}
                        {note.updatedAt !== note.createdAt && " · editada"}
                      </p>
                      {canManage(note) && (
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(note.id);
                              setEditingBody(note.body);
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleting(note)}
                          >
                            Excluir
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir observação</AlertDialogTitle>
            <AlertDialogDescription>
              A observação some do prontuário e a ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
    </Panel>
  );
}
