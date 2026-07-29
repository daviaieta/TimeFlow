"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { fetchAdapter } from "@/adapters/fetchAdapter";
import { saveToken } from "@/lib/auth";

const inputClassName =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">(
    "idle",
  );

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <HugeiconsIcon icon={Alert01Icon} className="size-8 text-destructive" />
        <p className="font-medium">Convite inválido</p>
        <p className="text-sm text-muted-foreground">
          Este link não contém um convite. Verifique o e-mail que você recebeu e
          use o link completo.
        </p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="size-8 text-primary"
        />
        <p className="font-medium">Senha definida com sucesso!</p>
        <p className="text-sm text-muted-foreground">
          Você já está conectado. Redirecionando…
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
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
        path: "/auth/accept-invite",
        body: { token, password },
      });
      saveToken(data.token);
      setStatus("success");
      setTimeout(() => router.push("/assinatura"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Nova senha
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo de 8 caracteres"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClassName}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium">
          Confirmar senha
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          placeholder="Repita a senha"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className={inputClassName}
        />
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <HugeiconsIcon icon={Alert01Icon} className="size-4 shrink-0" />
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={status === "submitting"}>
        {status === "submitting" ? "Salvando…" : "Definir senha e entrar"}
      </Button>
    </form>
  );
}
