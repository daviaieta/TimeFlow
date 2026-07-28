import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Nova senha — Time Flow",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 sm:px-6 sm:py-16 dark:bg-background">
      <Link href="/" className="mb-8 flex items-center">
        <Logo />
      </Link>

      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-lg font-semibold tracking-tight">Criar nova senha</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Escolha uma senha nova para entrar na sua conta.
        </p>
        {/* O formulário lê o token da query string, e useSearchParams exige
            Suspense — mesmo padrão da tela de convite. */}
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
