"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon, EyeIcon, EyeOffIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { apiPost } from "@/lib/api";
import { saveToken } from "@/lib/auth";

function GoogleLogo(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28a7.21 7.21 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

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
      const { token } = await apiPost<{ token: string }>("/auth/login", {
        email,
        password,
      });
      saveToken(token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() =>
              setError("Login com Google em breve — use e-mail e senha.")
            }
          >
            <GoogleLogo data-icon="inline-start" />
            Entrar com Google
          </Button>
        </Field>

        <FieldSeparator>ou</FieldSeparator>

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
          <Checkbox id="remember" defaultChecked />
          <FieldLabel htmlFor="remember" className="font-normal">
            Lembrar de mim
          </FieldLabel>
          <a
            href="#"
            className="ml-auto text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Esqueceu a senha?
          </a>
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
