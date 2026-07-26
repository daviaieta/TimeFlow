"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { BusinessTable } from "@/components/dashboard/business-table";
import { CreateBusinessDialog } from "@/components/dashboard/create-business-dialog";
import { PlatformTiles } from "@/components/dashboard/platform-tiles";
import {
  BusinessRow,
  PlatformOverview as PlatformOverviewData,
} from "@/lib/platform";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className ?? ""}`} />;
}

export function PlatformOverview() {
  const [data, setData] = useState<PlatformOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [resentId, setResentId] = useState<number | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  // Devolve uma promise que nunca rejeita: erros de rede viram estado local,
  // para que `await load()` dentro da transition sempre resolva e o
  // `isPending` volte a false mesmo quando o fetch falha.
  const load = useCallback(() => {
    return fetchAdapter<PlatformOverviewData>({
      method: "GET",
      path: "/businesses",
    })
      .then(({ data: overview }) => {
        setData(overview);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, []);

  // A lista não é recarregada no sucesso: o convite continua pendente (só o
  // token mudou), então o único efeito visível é a confirmação no próprio botão.
  const handleResend = useCallback(async (row: BusinessRow) => {
    const invite = row.pendingInvites[0];
    if (!invite) return;

    setResendingId(row.id);
    setResendError(null);
    try {
      await fetchAdapter({
        method: "POST",
        path: `/businesses/${row.id}/resend-invite`,
        body: { userId: invite.id },
      });
      setResentId(row.id);
    } catch (err) {
      setResendError(
        err instanceof ApiError
          ? `Não foi possível reenviar o convite de ${row.name}.`
          : "Erro inesperado.",
      );
    } finally {
      setResendingId(null);
    }
  }, []);

  // O fetch roda dentro de uma transition (em vez de um setState síncrono no
  // corpo do efeito) para não disparar o lint `react-hooks/set-state-in-effect`
  // e para que `isPending` sirva como indicador de carregamento — tanto no
  // efeito de montagem quanto no retry manual do botão de erro.
  const runLoad = useCallback(() => {
    startTransition(async () => {
      await load();
    });
  }, [load]);

  useEffect(() => {
    runLoad();
  }, [runLoad]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Plataforma</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Os negócios cadastrados no Time Flow.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          Novo negócio
        </Button>
      </div>

      <CreateBusinessDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />

      {error ? (
        <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium">{error}</p>
          <Button className="mt-4" size="sm" disabled={isPending} onClick={runLoad}>
            {isPending ? "Tentando…" : "Tentar de novo"}
          </Button>
        </div>
      ) : null}

      {!error && !data ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : null}

      {data ? (
        <div className="mt-8">
          <PlatformTiles totals={data.totals} />

          {resendError ? (
            <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {resendError}
            </p>
          ) : null}

          <div className="mt-4">
            {data.businesses.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center">
                <p className="text-sm font-medium">Nenhum negócio cadastrado ainda</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cadastre o primeiro negócio para começar.
                </p>
                <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                  Cadastrar negócio
                </Button>
              </div>
            ) : (
              <BusinessTable
                businesses={data.businesses}
                onResend={handleResend}
                resendingId={resendingId}
                resentId={resentId}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
