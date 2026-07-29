"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  DARK_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  isThemedPath,
  type Theme,
} from "@/lib/theme";

export type { Theme };

type ThemeContextValue = {
  /** Tema em vigor na tela. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// A escolha do usuário mora no localStorage, não em estado do React: é a mesma
// fonte que o script inline do layout lê antes da primeira pintura. Ler daqui
// com useSyncExternalStore evita o mismatch de hidratação — o React usa o
// snapshot do servidor ao hidratar e só depois compara com o do cliente.
const listeners = new Set<() => void>();

function subscribeToStoredTheme(onChange: () => void) {
  listeners.add(onChange);
  // "storage" só dispara em *outras* abas; o emit local cobre esta aqui.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** `null` = usuário nunca escolheu; nesse caso vale a preferência do SO. */
function getStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage bloqueado (modo privativo, cookies de terceiros): o tema
    // deixa de persistir, mas a página continua de pé.
  }
  return null;
}

function writeStoredTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // idem: sem persistência, a sessão atual ainda troca de tema.
  }
  listeners.forEach((listener) => listener());
}

// `prefers-color-scheme` é o outro estado de fora do React. Assinar mantém o
// primeiro acesso acompanhando o SO se ele trocar no meio da sessão; depois do
// primeiro clique no botão a escolha explícita passa a mandar.
function subscribeToSystemTheme(onChange: () => void) {
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSystemPrefersDark() {
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // No servidor não há localStorage nem preferência de SO. Os snapshots abaixo
  // valem só até a hidratação; quem manda na primeira pintura é o script
  // inline do `app/layout.tsx`.
  const storedTheme = useSyncExternalStore(
    subscribeToStoredTheme,
    getStoredTheme,
    () => null,
  );
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemPrefersDark,
    () => false,
  );

  // Navegação client-side também tem que respeitar a rota: sair do dashboard
  // escuro para a página pública de um negócio precisa clarear na hora.
  const pathname = usePathname();

  const theme: Theme = !isThemedPath(pathname)
    ? "light"
    : (storedTheme ?? (systemPrefersDark ? "dark" : "light"));

  const setTheme = useCallback((next: Theme) => writeStoredTheme(next), []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    // colorScheme faz o navegador pintar scrollbar, campos nativos e o fundo
    // da página no tom certo — coisas que o CSS do app não alcança.
    root.style.colorScheme = theme;
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme precisa estar dentro de <ThemeProvider>");
  }
  return context;
}
