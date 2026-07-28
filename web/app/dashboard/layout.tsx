"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  DashboardSquare01Icon,
  Logout03Icon,
  Scissor01Icon,
  Settings02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { fetchAdapter } from "@/adapters/fetchAdapter";
import { AuthUser, Role, clearToken, getToken } from "@/lib/auth";
import { formatBusinessName } from "@/lib/businessName";
import { AuthUserProvider } from "./auth-context";

const navItems: {
  label: string;
  href: string;
  icon: typeof DashboardSquare01Icon;
  roles: Role[];
}[] = [
  {
    label: "Visão geral",
    href: "/dashboard",
    icon: DashboardSquare01Icon,
    roles: ["SUPERADMIN", "ADMIN", "EMPLOYEE"],
  },
  {
    label: "Serviços",
    href: "/dashboard/services",
    icon: Scissor01Icon,
    roles: ["ADMIN", "EMPLOYEE"],
  },
  {
    label: "Equipe",
    href: "/dashboard/team",
    icon: UserGroupIcon,
    roles: ["ADMIN", "EMPLOYEE"],
  },
  {
    label: "Agenda",
    href: "/dashboard/schedule",
    icon: Calendar03Icon,
    roles: ["EMPLOYEE", "ADMIN"],
  },
  {
    label: "Configurações",
    href: "/dashboard/settings",
    icon: Settings02Icon,
    roles: ["SUPERADMIN", "ADMIN", "EMPLOYEE"],
  },
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
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  const loadUser = useCallback(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return Promise.resolve();
    }

    return fetchAdapter<{ user: AuthUser }>({ method: "GET", path: "/auth/me" })
      .then(({ data }) => setUser(data.user))
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Sem assinatura ativa não há nada de útil no dashboard: manda para a
  // página de assinatura, que é cheia e não tem sidebar. Sem trial: bloqueia
  // desde a criação do negócio, não só depois de um período gratuito.
  useEffect(() => {
    if (
      user &&
      user.role !== "SUPERADMIN" &&
      user.business &&
      user.business.subscriptionStatus !== "ACTIVE"
    ) {
      router.replace("/assinatura");
    }
  }, [user, router]);

  // O contexto precisa de identidade estável: recriar o objeto a cada render
  // faria toda tela consumidora re-renderizar sem motivo.
  const contextValue = useMemo(
    () => (user ? { user, refresh: loadUser } : null),
    [user, loadUser],
  );

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  if (!user || !contextValue) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-background">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  return (
    <AuthUserProvider value={contextValue}>
      <div className="flex flex-1 bg-zinc-50 dark:bg-background">
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-card px-4 py-6 sm:flex">
          <Link href="/dashboard" className="flex items-center px-2">
            <Logo />
          </Link>

          <nav className="mt-8 flex flex-col gap-1">
            {navItems
              .filter((item) => item.roles.includes(user.role))
              .map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <HugeiconsIcon
                      icon={item.icon}
                      className="size-4 shrink-0"
                    />
                    {item.label}
                  </Link>
                );
              })}
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
            {user.business ? (
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">
                    {formatBusinessName(user.business.name)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Painel do {roleLabels[user.role]}
                  </p>
                </div>
              </div>
            ) : (
              <p className="truncate text-sm font-medium">Plataforma</p>
            )}
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
