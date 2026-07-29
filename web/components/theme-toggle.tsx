"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

/**
 * Botão de um clique: claro ↔ escuro. O ícone mostra o tema em vigor.
 * Antes do primeiro clique o tema vem do SO; depois dele vale a escolha.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={
        theme === "dark" ? "Tema escuro. Mudar para claro" : "Tema claro. Mudar para escuro"
      }
      title={theme === "dark" ? "Tema escuro" : "Tema claro"}
      className={cn(
        "flex size-9 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <HugeiconsIcon
        icon={theme === "dark" ? Moon02Icon : Sun03Icon}
        className="size-5"
      />
    </button>
  );
}
