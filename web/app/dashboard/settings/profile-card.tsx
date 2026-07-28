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
import { AuthUser } from "@/lib/auth";
import { useRefreshAuthUser } from "../auth-context";

function translateError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erro inesperado.";

  if (error.status === 401) return "Senha atual incorreta.";
  if (error.status === 409) return "Esse e-mail já está em uso por outra conta.";
  if (error.status === 400) return "Confirme sua senha atual para trocar o e-mail.";

  return error.message;
}

export function ProfileCard({ user }: { user: AuthUser }) {
  const refresh = useRefreshAuthUser();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Comparar com o valor que veio do servidor decide se o campo de senha
  // aparece — a mesma regra que o service aplica, espelhada para o usuário
  // não descobrir a exigência só depois de tomar um 400.
  const emailChanged = email.trim().toLowerCase() !== user.email.trim().toLowerCase();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);

    try {
      await fetchAdapter({
        method: "PUT",
        path: "/auth/me",
        body: {
          name,
          email,
          ...(emailChanged ? { currentPassword } : {}),
        },
      });
      setCurrentPassword("");
      setSaved(true);
      await refresh();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Seus dados</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Como seu nome aparece para a equipe e o e-mail que você usa para entrar.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="profile-name">Nome</FieldLabel>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="profile-email">E-mail</FieldLabel>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          {emailChanged ? (
            <Field>
              <FieldLabel htmlFor="profile-current-password">
                Senha atual
              </FieldLabel>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
              <FieldDescription>
                Trocar o e-mail muda como você entra na plataforma, então
                precisamos confirmar que é você.
              </FieldDescription>
            </Field>
          ) : null}

          {error ? <FieldError>{error}</FieldError> : null}
          {saved && !error ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Dados salvos.
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
    </section>
  );
}
