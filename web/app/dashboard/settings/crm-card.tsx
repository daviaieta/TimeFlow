"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { CrmSettings } from "@/lib/types";

// Configuração de CRM do negócio. O GET responde os padrões antes de existir
// linha no banco, então esta tela nunca precisa tratar "ainda não configurado"
// como um estado à parte — só o 404 da flag desligada.

export function CrmCard() {
  const [settings, setSettings] = useState<CrmSettings | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [pointsPerUnit, setPointsPerUnit] = useState("1");
  const [expiresEnabled, setExpiresEnabled] = useState(false);
  const [pointsExpireAfterDays, setPointsExpireAfterDays] = useState("365");
  const [customerLoginEnabled, setCustomerLoginEnabled] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const apply = useCallback((next: CrmSettings) => {
    setSettings(next);
    setLoyaltyEnabled(next.loyaltyEnabled);
    setPointsPerUnit(String(next.pointsPerUnit));
    setExpiresEnabled(next.pointsExpireAfterDays !== null);
    // Guarda um valor plausível no campo mesmo quando a expiração está
    // desligada: ligar a caixa e encontrar o campo vazio é um passo a mais.
    setPointsExpireAfterDays(String(next.pointsExpireAfterDays ?? 365));
    setCustomerLoginEnabled(next.customerLoginEnabled);
  }, []);

  useEffect(() => {
    fetchAdapter<{ settings: CrmSettings }>({ method: "GET", path: "/crm/settings" })
      .then(({ data }) => apply(data.settings))
      .catch((err) => {
        // 404 = CRM desligado no servidor. O cartão some em vez de mostrar um
        // erro sobre algo que o dono não pode resolver daqui.
        if (err instanceof ApiError && err.status === 404) {
          setUnavailable(true);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, [apply]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const parsedPoints = Number(pointsPerUnit);
    if (!Number.isInteger(parsedPoints) || parsedPoints < 1) {
      setError("Pontos por real precisa ser um número inteiro de 1 ou mais.");
      return;
    }

    let expireDays: number | null = null;
    if (expiresEnabled) {
      expireDays = Number(pointsExpireAfterDays);
      if (!Number.isInteger(expireDays) || expireDays < 1) {
        setError("A validade precisa ser um número inteiro de dias.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data } = await fetchAdapter<{ settings: CrmSettings }>({
        method: "PATCH",
        path: "/crm/settings",
        body: {
          loyaltyEnabled,
          pointsPerUnit: parsedPoints,
          pointsExpireAfterDays: expireDays,
          customerLoginEnabled,
        },
      });
      apply(data.settings);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  if (unavailable) return null;

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Clientes e fidelidade</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Como o seu negócio trata a carteira de clientes.
      </p>

      {settings === null ? (
        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6">
          <FieldGroup>
            <Field orientation="horizontal">
              <Checkbox
                id="crm-loyalty"
                checked={loyaltyEnabled}
                onCheckedChange={(checked) => setLoyaltyEnabled(checked === true)}
              />
              <FieldLabel htmlFor="crm-loyalty" className="font-normal">
                Acumular pontos de fidelidade
              </FieldLabel>
            </Field>

            <Field>
              <FieldLabel htmlFor="crm-points">Pontos por real gasto</FieldLabel>
              <Input
                id="crm-points"
                type="number"
                min={1}
                max={1000}
                value={pointsPerUnit}
                onChange={(event) => setPointsPerUnit(event.target.value)}
                disabled={!loyaltyEnabled}
                className="sm:max-w-32"
              />
              <FieldDescription>
                Vale para reservas concluídas. Enquanto a reserva não tiver
                ciclo de vida, só o ajuste manual lança pontos.
              </FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id="crm-expires"
                checked={expiresEnabled}
                onCheckedChange={(checked) => setExpiresEnabled(checked === true)}
                disabled={!loyaltyEnabled}
              />
              <FieldLabel htmlFor="crm-expires" className="font-normal">
                Os pontos expiram
              </FieldLabel>
            </Field>

            {expiresEnabled && (
              <Field>
                <FieldLabel htmlFor="crm-expire-days">Validade (dias)</FieldLabel>
                <Input
                  id="crm-expire-days"
                  type="number"
                  min={1}
                  max={3650}
                  value={pointsExpireAfterDays}
                  onChange={(event) => setPointsExpireAfterDays(event.target.value)}
                  disabled={!loyaltyEnabled}
                  className="sm:max-w-32"
                />
              </Field>
            )}

            <Field orientation="horizontal">
              <Checkbox
                id="crm-login"
                checked={customerLoginEnabled}
                onCheckedChange={(checked) =>
                  setCustomerLoginEnabled(checked === true)
                }
              />
              <FieldLabel htmlFor="crm-login" className="font-normal">
                Oferecer login ao cliente na página pública
              </FieldLabel>
            </Field>
            <FieldDescription>
              Reservar como convidado continua sendo o caminho padrão e mais
              rápido — o login é um atalho para quem já é cliente.
            </FieldDescription>

            {error ? <FieldError>{error}</FieldError> : null}
            {saved && !error ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Configuração salva.
              </p>
            ) : null}

            <Field>
              <Button className="w-full sm:w-auto" type="submit" disabled={submitting}>
                {submitting ? <Spinner data-icon="inline-start" /> : null}
                {submitting ? "Salvando…" : "Salvar"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      )}
    </section>
  );
}
