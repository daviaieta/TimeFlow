"use client";

import { createContext, useContext } from "react";
import { AuthUser } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser;
  billingEnabled: boolean;
  refresh: () => Promise<void>;
}

const AuthUserContext = createContext<AuthContextValue | null>(null);

export const AuthUserProvider = AuthUserContext.Provider;

function useAuthContext(): AuthContextValue {
  const value = useContext(AuthUserContext);
  if (!value) {
    throw new Error("useAuthUser must be used inside the dashboard layout");
  }

  return value;
}

export function useAuthUser(): AuthUser {
  return useAuthContext().user;
}

// Separado de useAuthUser para que as telas que só leem o usuário não precisem
// saber que existe um refresh — nenhuma delas muda.
export function useRefreshAuthUser(): () => Promise<void> {
  return useAuthContext().refresh;
}

// Falso durante o período de cortesia: nada de assinatura aparece no painel e
// ninguém é mandado para /assinatura. Quem manda é o servidor.
export function useBillingEnabled(): boolean {
  return useAuthContext().billingEnabled;
}
