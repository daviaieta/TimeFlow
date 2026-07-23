"use client";

import { createContext, useContext } from "react";
import { AuthUser } from "@/lib/auth";

const AuthUserContext = createContext<AuthUser | null>(null);

export const AuthUserProvider = AuthUserContext.Provider;

export function useAuthUser(): AuthUser {
  const user = useContext(AuthUserContext);
  if (!user) {
    throw new Error("useAuthUser must be used inside the dashboard layout");
  }

  return user;
}
