import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar — Time Flow",
};

export default function LoginPage() {
  return (
    <div className="grid flex-1 lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Voltar ao site
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex flex-1 items-center">
          <div className="w-full max-w-sm">
            <h1 className="mb-8 text-4xl font-semibold tracking-tight sm:text-5xl">
              Bem-vindo de volta
            </h1>
            <LoginForm />
            <p className="mt-8 text-sm text-muted-foreground">
              Novo por aqui?{" "}
              <span className="font-medium text-foreground">
                Peça um convite ao administrador da sua equipe.
              </span>
            </p>
          </div>
        </main>

        <footer className="flex items-center justify-between text-sm text-muted-foreground">
          <span>© 2026 Time Flow</span>
          <div className="flex items-center gap-6">
            <Link href="/" className="transition-colors hover:text-foreground">
              Contato
            </Link>
            <Link href="/" className="transition-colors hover:text-foreground">
              Docs
            </Link>
          </div>
        </footer>
      </div>

      <div aria-hidden className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[linear-gradient(112deg,#c7d2fe_0%,#a5b4fc_30%,#818cf8_55%,#6366f1_78%,#3730a3_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_38%_at_68%_22%,rgba(255,255,255,0.55),transparent_70%),radial-gradient(ellipse_42%_30%_at_38%_60%,rgba(255,255,255,0.35),transparent_70%),radial-gradient(ellipse_55%_35%_at_82%_78%,rgba(255,255,255,0.25),transparent_70%)]" />
        <div className="absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-background to-transparent" />
      </div>
    </div>
  );
}
