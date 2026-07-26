import { Role } from "@prisma/client";

// O que o repositório entrega, antes de qualquer merge.
export interface BusinessBaseRow {
  id: number;
  name: string;
  slug: string;
  createdAt: Date;
}

// Formato de saída do prisma.user.groupBy: uma linha por par (negócio, papel).
export interface RoleCountRow {
  businessId: number | null;
  role: Role;
  _count: { _all: number };
}

export interface PendingInviteRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  businessId: number | null;
}

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
  createdAt: string;
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

export function buildBusinessRows(
  businesses: BusinessBaseRow[],
  roleCounts: RoleCountRow[],
  pendingInvites: PendingInviteRow[],
): BusinessRow[] {
  // Indexa as duas listas por businessId antes do map: varrê-las dentro do map
  // faria o merge virar O(negócios × usuários).
  const counts = new Map<number, { employees: number; admins: number }>();
  for (const row of roleCounts) {
    // businessId nulo = usuário sem vínculo (o SUPERADMIN, ou o ADMIN órfão do
    // seed). O repositório já filtra, mas o tipo permite null e a regra pura
    // não pode depender de quem a chama.
    if (row.businessId === null) continue;

    const entry = counts.get(row.businessId) ?? { employees: 0, admins: 0 };
    if (row.role === Role.EMPLOYEE) entry.employees = row._count._all;
    if (row.role === Role.ADMIN) entry.admins = row._count._all;
    counts.set(row.businessId, entry);
  }

  const pending = new Map<number, PendingInvite[]>();
  for (const row of pendingInvites) {
    if (row.businessId === null) continue;

    const list = pending.get(row.businessId) ?? [];
    list.push({ id: row.id, name: row.name, email: row.email, role: row.role });
    pending.set(row.businessId, list);
  }

  return businesses.map((business) => ({
    id: business.id,
    name: business.name,
    slug: business.slug,
    createdAt: business.createdAt.toISOString(),
    employees: counts.get(business.id)?.employees ?? 0,
    admins: counts.get(business.id)?.admins ?? 0,
    pendingInvites: pending.get(business.id) ?? [],
  }));
}

// Somar as linhas já montadas, em vez de agregar de novo no banco, garante que
// os cartões do topo nunca divirjam da tabela logo abaixo deles.
export function buildPlatformTotals(rows: BusinessRow[]): PlatformTotals {
  return {
    businesses: rows.length,
    employees: rows.reduce((sum, row) => sum + row.employees, 0),
    admins: rows.reduce((sum, row) => sum + row.admins, 0),
    pendingInvites: rows.reduce((sum, row) => sum + row.pendingInvites.length, 0),
  };
}
