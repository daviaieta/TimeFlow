"use client";

import { FormEvent, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, MailValidation01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { fetchAdapter } from "@/adapters/fetchAdapter";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "sent">("idle");

  // A mensagem é deliberadamente condicional ("se estiver cadastrado"): o
  // servidor responde igual para e-mail conhecido e desconhecido, e a tela
  // não pode entregar o que a API esconde.
  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <HugeiconsIcon
          icon={MailValidation01Icon}
          className="size-8 text-primary"
        />
        <p className="font-medium">Verifique seu e-mail</p>
        <p className="text-sm text-muted-foreground">
          Se {email} estiver cadastrado, o link para criar uma nova senha chega
          em instantes. Ele vale por 1 hora.
        </p>
        <p className="text-sm text-muted-foreground">
          Não chegou? Olhe no spam ou{" "}
          <button
            type="button"
            className="font-medium text-foreground underline"
            onClick={() => setStatus("idle")}
          >
            tente outro e-mail
          </button>
          .
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("submitting");

    try {
      await fetchAdapter({
        method: "POST",
        path: "/auth/forgot-password",
        body: { email },
      });
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
                Enviando…
              </>
            ) : (
              "Enviar link de recuperação"
            )}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
