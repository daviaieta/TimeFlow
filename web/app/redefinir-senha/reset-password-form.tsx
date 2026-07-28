"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { fetchAdapter } from "@/adapters/fetchAdapter";
import { saveToken } from "@/lib/auth";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <HugeiconsIcon icon={Alert01Icon} className="size-8 text-destructive" />
        <p className="font-medium">Link incompleto</p>
        <p className="text-sm text-muted-foreground">
          Este endereço não traz um token de recuperação. Abra o link direto do
          e-mail, sem editar o endereço.
        </p>
        <Link href="/esqueci-senha" className="text-sm font-medium underline">
          Pedir um link novo
        </Link>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="size-8 text-indigo-600"
        />
        <p className="font-medium">Senha alterada</p>
        <p className="text-sm text-muted-foreground">
          Você já está conectado. Redirecionando…
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setStatus("submitting");
    try {
      const { data } = await fetchAdapter<{ token: string }>({
        method: "POST",
        path: "/auth/reset-password",
        body: { token, password },
      });
      saveToken(data.token);
      setStatus("success");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="password">Nova senha</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
            required
          />
        </Field>

        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="confirm-password">Confirmar senha</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="Repita a senha"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
            required
          />
        </Field>

        {error && (
          <FieldError>
            <HugeiconsIcon icon={Alert01Icon} className="size-4 shrink-0" />
            {error}
          </FieldError>
        )}

        <Field>
          <Button type="submit" size="lg" disabled={status === "submitting"}>
            {status === "submitting" ? (
              <>
                <Spinner data-icon="inline-start" />
                Salvando…
              </>
            ) : (
              "Salvar e entrar"
            )}
          </Button>
        </Field>

        <p className="text-center text-sm text-muted-foreground">
          Link expirado?{" "}
          <Link href="/esqueci-senha" className="font-medium text-foreground underline">
            Peça um novo
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
