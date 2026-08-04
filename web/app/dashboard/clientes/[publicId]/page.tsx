"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { customerStatusLabels, formatDate } from "@/lib/crm";
import { formatCurrency } from "@/lib/dashboard";
import { CustomerProfile } from "@/lib/types";
import { CustomerFormDialog } from "../customer-form-dialog";
import { CustomerBookings } from "./customer-bookings";
import { CustomerLoyalty } from "./customer-loyalty";
import { CustomerNotes } from "./customer-notes";
import { CustomerTags } from "./customer-tags";

// Prontuário do cliente. Tudo o que a equipe precisa numa tela só — histórico,
// observações, fidelidade e etiquetas — porque no balcão ninguém navega entre
// abas com o cliente esperando.
//
// `useParams` em vez de receber `params`: em client component é o jeito de ler
// a rota dinâmica sem lidar com a Promise que o Next passa para o servidor.

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function CustomerDetailPage() {
  const params = useParams<{ publicId: string }>();
  const publicId = params.publicId;

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(() => {
    return fetchAdapter<{ profile: CustomerProfile }>({
      method: "GET",
      path: `/customers/${publicId}`,
    })
      .then(({ data }) => {
        setProfile(data.profile);
        setError(null);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? "Cliente não encontrado neste negócio."
            : err instanceof ApiError
              ? err.message
              : "Erro inesperado.",
        );
      });
  }, [publicId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href="/dashboard/clientes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          Clientes
        </Link>
        <p className="mt-8 rounded-2xl border bg-card p-12 text-center text-sm text-destructive shadow-sm">
          {error}
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href="/dashboard/clientes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        Clientes
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {profile.displayName}
            </h1>
            {profile.status === "BLOCKED" && (
              <Badge variant="destructive">{customerStatusLabels.BLOCKED}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.displayPhone ?? "Sem telefone"}
            {profile.displayEmail ? ` · ${profile.displayEmail}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cliente desde {formatDate(profile.createdAt)}
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => setEditOpen(true)}
        >
          <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" />
          Editar
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Reservas"
          value={String(profile.bookingsCount)}
          hint={
            profile.lastBookedAt
              ? `última em ${formatDate(profile.lastBookedAt)}`
              : "nenhuma ainda"
          }
        />
        <Stat
          label="Valor reservado"
          value={formatCurrency(profile.totalSpent)}
          hint={
            profile.spendIsEstimated
              ? "estimativa: inclui reservas sem preço registrado"
              : "valor reservado, não liquidado"
          }
        />
        <Stat
          label="Pontos"
          value={String(profile.loyaltyPoints)}
          hint="saldo de fidelidade"
        />
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <CustomerTags profile={profile} onChanged={load} />

        <div className="grid gap-4 lg:grid-cols-2">
          <CustomerBookings publicId={profile.publicId} />
          <CustomerLoyalty
            publicId={profile.publicId}
            balance={profile.loyaltyPoints}
            onChanged={load}
          />
        </div>

        <CustomerNotes publicId={profile.publicId} />
      </div>

      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={profile}
        onSaved={(saved) => setProfile(saved)}
      />
    </div>
  );
}
