import type { Role } from "./auth";

export interface PendingInvite {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface BusinessRow {
  id: number;
  name: string;
  slug: string;
  createdAt: string; // ISO vindo da API
  employees: number;
  admins: number;
  pendingInvites: PendingInvite[];
}

export interface PlatformTotals {
  businesses: number;
  employees: number;
  admins: number;
  pendingInvites: number;
}

export interface PlatformOverview {
  totals: PlatformTotals;
  businesses: BusinessRow[];
}

// Mesmo formato que o schema de POST /businesses exige no servidor.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    // Tira os diacríticos que o NFD separou: "Zé" → "Ze". Escapes unicode em
    // vez dos caracteres combinantes literais, que são invisíveis no editor.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function businessStatus(row: BusinessRow): "pending" | "active" {
  return row.pendingInvites.length > 0 ? "pending" : "active";
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatCreatedAt(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatTeam(row: BusinessRow): string {
  const employees = row.employees === 1 ? "colaborador" : "colaboradores";
  const admins = row.admins === 1 ? "admin" : "admins";

  return `${row.employees} ${employees} · ${row.admins} ${admins}`;
}
