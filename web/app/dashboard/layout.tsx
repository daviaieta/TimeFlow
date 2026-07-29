"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  DashboardSquare01Icon,
  Logout03Icon,
  Mail01Icon,
  Scissor01Icon,
  Settings02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { BusinessMark } from "@/components/business-mark";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
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
    label: "Contatos",
    href: "/dashboard/contatos",
    icon: Mail01Icon,
    roles: ["SUPERADMIN"],
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
  const [billingEnabled, setBillingEnabled] = useState(true);

  const loadUser = useCallback(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return Promise.resolve();
    }

    return fetchAdapter<{ user: AuthUser; billingEnabled: boolean }>({
      method: "GET",
      path: "/auth/me",
    })
      .then(({ data }) => {
        setUser(data.user);
        setBillingEnabled(data.billingEnabled);
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Sem assinatura ativa não há nada de útil no dashboard: manda para a
  // página de assinatura, que é cheia e não tem sidebar. Com a cobrança
  // desligada no servidor, ninguém é mandado para lá — o negócio segue
  // PENDING no banco e usa o painel inteiro.
  useEffect(() => {
    if (
      billingEnabled &&
      user &&
      user.role !== "SUPERADMIN" &&
      user.business &&
      user.business.subscriptionStatus !== "ACTIVE"
    ) {
      router.replace("/assinatura");
    }
  }, [billingEnabled, user, router]);

  // O contexto precisa de identidade estável: recriar o objeto a cada render
  // faria toda tela consumidora re-renderizar sem motivo.
  const contextValue = useMemo(
    () => (user ? { user, billingEnabled, refresh: loadUser } : null),
    [user, billingEnabled, loadUser],
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

  const visibleNav = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <AuthUserProvider value={contextValue}>
      <div className="flex flex-1 bg-zinc-50 dark:bg-background">
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-card px-4 py-6 sm:flex">
          <Link href="/dashboard" className="flex items-center px-2">
            <Logo />
          </Link>

          <nav className="mt-8 flex flex-col gap-1">
            {visibleNav.map((item) => {
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
                  <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" />
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
          <header className="flex h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:px-6">
            {user.business ? (
              <div className="flex min-w-0 items-center gap-3">
                <BusinessMark
                  name={user.business.name}
                  slug={user.business.slug}
                  src={user.business.logoUrl}
                  className="size-9 rounded-xl"
                />
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
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <HugeiconsIcon icon={Logout03Icon} data-icon="inline-start" />
                Sair
              </Button>
            </div>
          </header>

          {/* pb-24 no mobile: a barra de navegação é fixa e cobriria o fim da
              página, incluindo o último botão de qualquer formulário. */}
          <main className="flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-8">
            {children}
          </main>
        </div>

        {/* Abaixo de sm a sidebar some e, até aqui, sumia junto a única forma
            de trocar de tela. Barra inferior em vez de menu sanfona: o dono do
            negócio abre isto no balcão, com uma mão só. */}
        <nav
          aria-label="Navegação principal"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] sm:hidden"
        >
          <ul className="flex items-stretch">
            {visibleNav.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    // O rótulo é o mesmo da sidebar de propósito: um destino
                    // com dois nomes obriga a reaprender o painel no celular.
                    // Daí o corpo menor e o tracking apertado — "Configurações"
                    // precisa caber inteiro numa coluna de cinco.
                    className={`flex h-16 flex-col items-center justify-center gap-1 px-0.5 text-center text-[10px] font-medium tracking-tight transition-colors ${
                      active
                        ? "text-indigo-700 dark:text-indigo-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    <HugeiconsIcon icon={item.icon} className="size-5 shrink-0" />
                    <span className="w-full truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </AuthUserProvider>
  );
}
