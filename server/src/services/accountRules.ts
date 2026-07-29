import { Role } from "@prisma/client";

// Espaço e caixa não distinguem endereços de e-mail na prática, mas o @unique
// do Postgres compara byte a byte. Normalizar antes de comparar e de gravar
// impede que esta tela crie duas contas que o usuário leria como a mesma.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Trocar o e-mail é mexer no identificador de login, então exige confirmar a
// senha. Trocar só o nome é dado de exibição e não paga esse pedágio.
// Recebe os dois já normalizados: reenviar " Jose@X.com " contra um
// "jose@x.com" gravado não é uma troca.
export function requiresCurrentPassword(
  currentEmail: string,
  nextEmail: string,
): boolean {
  return currentEmail !== nextEmail;
}

// Guard de PUT /businesses/:id: o :id vem da URL, então a única coisa que
// impede um ADMIN de editar o negócio de outro é este cheque bater ANTES de
// qualquer leitura do alvo — devolver 404 para um id que existe mas não é seu
// vazaria a existência de outros negócios.
export function canEditBusiness(
  targetBusinessId: number,
  userBusinessId: number | null,
): boolean {
  return userBusinessId !== null && targetBusinessId === userBusinessId;
}

// Duas permissões diferentes no mesmo lugar: o dono cuida da vitrine inteira,
// o colaborador cuida da própria cara. `authorize()` não dá conta porque só
// olha papel, e aqui a identidade do alvo importa.
export function canEditEmployeeAvatar(
  actor: { id: number; role: Role; businessId: number | null },
  target: { id: number; businessId: number | null },
): boolean {
  if (actor.role === Role.ADMIN) {
    return actor.businessId !== null && actor.businessId === target.businessId;
  }

  if (actor.role === Role.EMPLOYEE) {
    return actor.id === target.id;
  }

  return false;
}
