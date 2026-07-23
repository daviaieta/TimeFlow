import { Suspense } from "react";
import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = {
  title: "Aceitar convite — Time Flow",
};

export default function AcceptInvitePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-background">
      <a href="/" className="mb-8 flex items-center">
        <Logo />
      </a>

      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">
          Você foi convidado 🎉
        </h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Defina uma senha para ativar sua conta e acessar a plataforma.
        </p>
        <Suspense>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  );
}
