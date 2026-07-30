const TOKEN_KEY = "token";

export type Role = "SUPERADMIN" | "ADMIN" | "EMPLOYEE";

export type PlanName = "ESSENCIAL" | "PROFISSIONAL" | "EQUIPE";
export type SubscriptionStatus = "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  business:
    | {
        id: number;
        name: string;
        slug: string;
        address: string | null;
        planName: PlanName | null;
        subscriptionStatus: SubscriptionStatus;
        logoUrl: string | null;
        bannerUrl: string | null;
      }
    | null;
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
