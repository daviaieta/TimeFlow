import crypto from "node:crypto";

const INVITE_TOKEN_TTL_HOURS = 48;

export function generateInviteToken(): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  return { token, expiresAt };
}
