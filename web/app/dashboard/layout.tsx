"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
import { fetchAdapter } from "@/adapters/fetchAdapter";
import { AuthUser, Role, clearToken, getToken } from "@/lib/auth";
import { businessInitials, formatBusinessName } from "@/lib/businessName";
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
    roles: ["EMPLOYEE"],
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

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    fetchAdapter<{ user: AuthUser }>({ method: "GET", path: "/auth/me" })
      .then(({ data }) => setUser(data.user))
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
            {navItems
              .filter((item) => item.roles.includes(user.role))
              .map((item) => {
                const active = pathname === item.href;
                return (
                  <a
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
                  </a>
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
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
                  {businessInitials(user.business.name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">
                    {formatBusinessName(user.business.name)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {roleLabels[user.role]}
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
