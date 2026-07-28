"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon, EyeIcon, EyeOffIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { fetchAdapter } from "@/adapters/fetchAdapter";
import { AuthUser, saveToken } from "@/lib/auth";

export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { data } = await fetchAdapter<{ token: string }>({
        method: "POST",
        path: "/auth/login",
        body: { email, password },
      });
      saveToken(data.token);

      // Decide o destino aqui, e não no dashboard: mandar todo mundo para
      // /dashboard e deixar o layout expulsar quem não pagou faz a tela piscar.
      const { data: me } = await fetchAdapter<{ user: AuthUser }>({
        method: "GET",
        path: "/auth/me",
      });

      const needsSubscription =
        me.user.role !== "SUPERADMIN" &&
        me.user.business !== null &&
        me.user.business.subscriptionStatus !== "ACTIVE";

      router.push(needsSubscription ? "/assinatura" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="email" className="sr-only">
            E-mail
          </FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="E-mail"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error ? true : undefined}
            required
          />
        </Field>

        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="password" className="sr-only">
            Senha
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={error ? true : undefined}
              required
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword((value) => !value)}
              >
                <HugeiconsIcon icon={showPassword ? EyeOffIcon : EyeIcon} />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>

        {error && <FieldError>{error}</FieldError>}

        <Field orientation="horizontal">
          <Link
            href="/esqueci-senha"
            className="ml-auto text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Esqueceu a senha?
          </Link>
        </Field>

        <Field>
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner data-icon="inline-start" />
                Entrando…
              </>
            ) : (
              <>
                Entrar
                <HugeiconsIcon
                  icon={ArrowRight02Icon}
                  data-icon="inline-end"
                />
              </>
            )}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
