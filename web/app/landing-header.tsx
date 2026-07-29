"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { LogoMarkCompact } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getToken } from "@/lib/auth";

const navLinks = [
  { label: "Produto", href: "#produto" },
  { label: "Recursos", href: "#recursos" },
  { label: "Preços", href: "#precos" },
  { label: "Contato", href: "/contato" },
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setLoggedIn(Boolean(getToken()));

    function onScroll() {
      setScrolled(window.scrollY > 10);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Trocar de rota fecha o menu: o header é o mesmo componente nas duas
  // páginas da landing, então ele não desmonta na navegação.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  // Fora da home as âncoras precisam apontar para "/#secao", senão o link
  // vira um hash morto na própria página (ex.: /contato#produto).
  function resolveHref(href: string) {
    if (!href.startsWith("#") || pathname === "/") return href;
    return `/${href}`;
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "pointer-events-none px-4 pt-3"
          : "bg-indigo-700 text-white dark:bg-indigo-900"
      }`}
    >
      <div
        className={`pointer-events-auto relative mx-auto transition-all duration-300 ${
          scrolled
            ? "max-w-2xl rounded-full bg-background/95 py-2 pr-2 pl-4 text-foreground shadow-lg ring-1 ring-border backdrop-blur"
            : "max-w-6xl px-6 py-4"
        }`}
      >
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* Fora do estado "scrolled" a logo fica sobre o roxo da marca:
                a plaquinha branca é o que garante contraste do símbolo. */}
            <span
              className={`flex size-8 items-center justify-center rounded-lg p-1 ring-1 ${
                scrolled
                  ? "text-primary ring-transparent"
                  : "bg-white text-indigo-700 ring-white/30"
              }`}
            >
              <LogoMarkCompact />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Time Flow
            </span>
          </Link>

          <nav
            className={`hidden items-center gap-8 text-sm font-medium md:flex ${
              scrolled ? "text-muted-foreground" : "text-white/85"
            }`}
          >
            {navLinks.map((link) => {
              const href = resolveHref(link.href);
              const className = `transition-colors ${
                scrolled ? "hover:text-foreground" : "hover:text-white"
              }`;

              // Rotas (começam com "/") usam navegação client-side; âncoras
              // (#hash) continuam como <a> para o scroll nativo na própria página.
              return href.startsWith("/") ? (
                <Link key={link.label} href={href} className={className}>
                  {link.label}
                </Link>
              ) : (
                <a key={link.label} href={href} className={className}>
                  {link.label}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle
              className={scrolled ? "" : "text-white hover:bg-white/15"}
            />

            <Link
              href={loggedIn ? "/dashboard" : "/login"}
              className={`rounded-full px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                scrolled
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-white text-indigo-950 hover:bg-indigo-50"
              }`}
            >
              {loggedIn ? "Ir para o dashboard" : "Entrar"}
            </Link>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              className={`flex size-10 items-center justify-center rounded-full transition-colors md:hidden ${
                scrolled
                  ? "text-foreground hover:bg-muted"
                  : "text-white hover:bg-white/15"
              }`}
            >
              <HugeiconsIcon
                icon={menuOpen ? Cancel01Icon : Menu01Icon}
                className="size-6"
              />
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div
            id="landing-mobile-menu"
            className={`absolute right-0 left-0 z-50 rounded-2xl bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-border md:hidden ${
              scrolled ? "top-full mt-2" : "top-full mx-4 -mt-1"
            }`}
          >
            <nav className="flex flex-col">
              {navLinks.map((link) => {
                const href = resolveHref(link.href);
                const className =
                  "rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground";

                return href.startsWith("/") ? (
                  <Link
                    key={link.label}
                    href={href}
                    className={className}
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.label}
                    href={href}
                    className={className}
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </a>
                );
              })}
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}
