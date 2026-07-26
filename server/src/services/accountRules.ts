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
