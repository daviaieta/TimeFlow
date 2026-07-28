import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Recuperar senha — Time Flow",
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 sm:px-6 sm:py-16 dark:bg-background">
      <Link href="/" className="mb-8 flex items-center">
        <Logo />
      </Link>

      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-lg font-semibold tracking-tight">Recuperar senha</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Informe seu e-mail e enviamos um link para você criar uma nova senha.
        </p>
        <ForgotPasswordForm />
      </div>

      <Link
        href="/login"
        className="mt-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Voltar para o login
      </Link>
    </div>
  );
}
