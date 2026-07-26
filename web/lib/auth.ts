const TOKEN_KEY = "token";

export type Role = "SUPERADMIN" | "ADMIN" | "EMPLOYEE";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  business: { id: number; name: string; slug: string; address: string | null } | null;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
