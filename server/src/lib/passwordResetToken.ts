import crypto from "node:crypto";

// Uma hora, e não as 48 horas do convite: o convite é esperado e chega a
// quem ainda não tem conta; a recuperação pode ter sido pedida por outra
// pessoa, então a janela em que o link vale precisa ser curta.
const PASSWORD_RESET_TTL_MINUTES = 60;

export const PASSWORD_RESET_TTL_LABEL = "1 hora";

// SHA-256 sem sal de propósito: o token já é 32 bytes aleatórios, então não
// há o que adivinhar por força bruta e o hash precisa ser determinístico
// para servir de chave de busca. bcrypt aqui impediria o lookup.
export function hashPasswordResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generatePasswordResetToken(now: Date): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = crypto.randomBytes(32).toString("hex");

  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
  };
}
