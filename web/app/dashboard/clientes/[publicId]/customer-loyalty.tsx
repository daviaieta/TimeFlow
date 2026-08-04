"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
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
import { Panel } from "@/components/dashboard/panel";
import { formatDateTime, formatPoints, loyaltyKindLabels, validateAdjustForm } from "@/lib/crm";
import { LoyaltyEntry } from "@/lib/types";
import { useAuthUser } from "../../auth-context";

const PAGE_SIZE = 10;

// Livro-razão de pontos. Só o ADJUST manual é lançado por aqui: EARN/REDEEM
// entram pelo ciclo de vida da reserva, que ainda não existe — daí a ausência
// de qualquer botão de "dar pontos por reserva".

export function CustomerLoyalty({
  publicId,
  balance,
  onChanged,
}: {
  publicId: string;
  balance: number;
  onChanged: () => void;
}) {
  const user = useAuthUser();
  const isAdmin = user.role === "ADMIN";

  const [entries, setEntries] = useState<LoyaltyEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    return fetchAdapter<{ entries: LoyaltyEntry[]; nextCursor: string | null }>({
      method: "GET",
      path: `/customers/${publicId}/loyalty?limit=${PAGE_SIZE}`,
    })
      .then(({ data }) => {
        setEntries(data.entries);
        setNextCursor(data.nextCursor);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, [publicId]);

  useEffect(() => {
    load();
  }, [load]);

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);

    fetchAdapter<{ entries: LoyaltyEntry[]; nextCursor: string | null }>({
      method: "GET",
      path: `/customers/${publicId}/loyalty?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
    })
      .then(({ data }) => {
        setEntries((current) => [...(current ?? []), ...data.entries]);
        setNextCursor(data.nextCursor);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      })
      .finally(() => setLoadingMore(false));
  }

  function openDialog() {
    setPoints("");
    setReason("");
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validated = validateAdjustForm({ points, reason });
    if (!validated.ok) {
      setFormError(validated.message);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await fetchAdapter({
        method: "POST",
        path: `/customers/${publicId}/loyalty`,
        body: { points: validated.points, reason: validated.reason },
      });
      setDialogOpen(false);
      await load();
      // O saldo mora no prontuário, que é do componente pai.
      onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel
      title="Fidelidade"
      description={`Saldo atual: ${balance} ${balance === 1 ? "ponto" : "pontos"}.`}
      action={
        isAdmin ? (
          <Button size="sm" variant="outline" onClick={openDialog}>
            Lançar ajuste
          </Button>
        ) : undefined
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      {entries === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum lançamento ainda.
          {isAdmin
            ? " Use “Lançar ajuste” para creditar ou debitar pontos à mão."
            : ""}
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {loyaltyKindLabels[entry.kind] ?? entry.kind}
                </p>
                {entry.reason && (
                  <p className="text-sm text-muted-foreground">{entry.reason}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.author?.name ?? "Sistema"} · {formatDateTime(entry.createdAt)}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  entry.points > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                }`}
              >
                {formatPoints(entry.points)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="ghost" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Carregando…" : "Ver mais lançamentos"}
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar ajuste</DialogTitle>
            <DialogDescription>
              Crédito ou débito manual de pontos. Fica registrado com o seu nome
              e não pode ser apagado.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAdjust}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="adjust-points">Pontos</FieldLabel>
                <Input
                  id="adjust-points"
                  type="text"
                  inputMode="numeric"
                  value={points}
                  onChange={(event) => setPoints(event.target.value)}
                  placeholder="50"
                  required
                />
                <FieldDescription>
                  Número inteiro. Negativo debita — “-20” tira 20 pontos.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="adjust-reason">Motivo</FieldLabel>
                <Input
                  id="adjust-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ex.: bônus de indicação"
                  maxLength={200}
                  required
                />
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
                      Lançando…
                    </>
                  ) : (
                    "Lançar"
                  )}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
