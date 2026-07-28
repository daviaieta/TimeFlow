"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
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

  useEffect(() => {
    setLoggedIn(Boolean(getToken()));

    function onScroll() {
      setScrolled(window.scrollY > 10);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? "pointer-events-none px-4 pt-3" : "bg-indigo-700 text-white"
      }`}
    >
      <div
        className={`pointer-events-auto mx-auto flex items-center justify-between transition-all duration-300 ${
          scrolled
            ? "max-w-2xl rounded-full bg-white/95 py-2 pr-2 pl-4 text-foreground shadow-lg ring-1 ring-black/5 backdrop-blur"
            : "max-w-6xl px-6 py-4"
        }`}
      >
        <Link href="/" className="flex items-center gap-2">
          <span
            className={`flex size-8 items-center justify-center rounded-lg bg-white p-1 ring-1 ${
              scrolled ? "ring-transparent" : "ring-white/30"
            }`}
          >
            <LogoMark className="size-6" />
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
            const className = `transition-colors ${
              scrolled ? "hover:text-foreground" : "hover:text-white"
            }`;

            // Rotas (começam com "/") usam navegação client-side; âncoras
            // (#hash) continuam como <a> para o scroll nativo na própria página.
            return link.href.startsWith("/") ? (
              <Link key={link.label} href={link.href} className={className}>
                {link.label}
              </Link>
            ) : (
              <a key={link.label} href={link.href} className={className}>
                {link.label}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
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
        </div>
      </div>
    </header>
  );
}
