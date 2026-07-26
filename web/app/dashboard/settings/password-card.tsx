"use client";

import { FormEvent, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// Mesmo mínimo do schema de PUT /auth/me/password no servidor.
const MIN_PASSWORD_LENGTH = 8;

export function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    setSubmitting(true);
    try {
      await fetchAdapter({
        method: "PUT",
        path: "/auth/me/password",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Senha atual incorreta."
          : "Erro inesperado.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Senha</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Trocar a senha não desconecta seus outros aparelhos.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="current-password">Senha atual</FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <FieldDescription>
              Pelo menos {MIN_PASSWORD_LENGTH} caracteres.
            </FieldDescription>
          </Field>

          {error ? <FieldError>{error}</FieldError> : null}
          {saved && !error ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Senha trocada.
            </p>
          ) : null}

          <Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {submitting ? "Salvando…" : "Trocar senha"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}
