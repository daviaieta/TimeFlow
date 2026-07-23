"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  DashboardSquare01Icon,
  Logout03Icon,
  Scissor01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { apiGet } from "@/lib/api";
import { AuthUser, clearToken, getToken } from "@/lib/auth";
import { AuthUserProvider } from "./auth-context";

const navItems = [
  { label: "Visão geral", href: "/dashboard", icon: DashboardSquare01Icon },
  { label: "Serviços", href: "#", icon: Scissor01Icon, soon: true },
  { label: "Equipe", href: "#", icon: UserGroupIcon, soon: true },
  { label: "Agenda", href: "#", icon: Calendar03Icon, soon: true },
];

const roleLabels: Record<AuthUser["role"], string> = {
  SUPERADMIN: "Super Admin",
  ADMIN: "Administrador",
  EMPLOYEE: "Colaborador",
};

export default function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    apiGet<{ user: AuthUser }>("/auth/me", token)
      .then(({ user }) => setUser(user))
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-background">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  return (
    <AuthUserProvider value={user}>
      <div className="flex flex-1 bg-zinc-50 dark:bg-background">
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-card px-4 py-6 sm:flex">
          <a href="/dashboard" className="flex items-center px-2">
            <Logo />
          </a>

          <nav className="mt-8 flex flex-col gap-1">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                aria-disabled={item.soon}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  item.soon
                    ? "pointer-events-none text-muted-foreground/60"
                    : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
                }`}
              >
                <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" />
                {item.label}
                {item.soon && (
                  <span className="ml-auto rounded-full border px-1.5 py-0.5 text-[10px] uppercase">
                    em breve
                  </span>
                )}
              </a>
            ))}
          </nav>

          <div className="mt-auto border-t pt-4">
            <p className="truncate px-2 text-sm font-medium">{user.name}</p>
            <p className="truncate px-2 text-xs text-muted-foreground">
              {roleLabels[user.role]}
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b bg-card px-6">
            <p className="truncate text-sm font-medium">
              {user.business?.name ?? "Plataforma"}
            </p>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <HugeiconsIcon icon={Logout03Icon} data-icon="inline-start" />
              Sair
            </Button>
          </header>

          <main className="flex-1 px-6 py-8">{children}</main>
        </div>
      </div>
    </AuthUserProvider>
  );
}
