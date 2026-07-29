import { env } from "../config/env";
import { sendPasswordResetEmail } from "../lib/emails/passwordReset";
import { comparePassword, hashPassword } from "../lib/password";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "../lib/passwordResetToken";
import { TooManyRequestsError, UnauthorizedError } from "../lib/errors";
import { createRateLimiter } from "../lib/rateLimit";
import { userRepository } from "../repositories/userRepository";
import { imageService } from "./imageService";

// Por IP, não por e-mail: limitar por e-mail deixaria qualquer um bloquear a
// recuperação de uma conta alheia só pedindo reset várias vezes.
const PASSWORD_RESET_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 };
const passwordResetLimiter = createRateLimiter(PASSWORD_RESET_RATE_LIMIT);

export const authService = {
  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.password) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const passwordMatches = await comparePassword(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedError("Invalid credentials");
    }

    return user;
  },

  async acceptInvite(inviteToken: string, password: string) {
    const user = await userRepository.findByInviteToken(inviteToken);

    const isExpired = !user?.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date();
    if (!user || isExpired) {
      throw new UnauthorizedError("Invalid or expired invite token");
    }

    return userRepository.acceptInvite(user.id, await hashPassword(password));
  },

  // Nunca revela se o e-mail existe: quem chama recebe a mesma resposta nos
  // dois casos. Uma mensagem diferente para e-mail desconhecido transformaria
  // esta rota pública num verificador de quem tem conta na plataforma.
  async requestPasswordReset(email: string, ip: string, now: Date): Promise<void> {
    if (passwordResetLimiter.hit(ip, now.getTime())) {
      throw new TooManyRequestsError(
        "Muitos pedidos em pouco tempo. Tente novamente mais tarde.",
      );
    }

    const user = await userRepository.findByEmail(email.trim().toLowerCase());
    // Sem senha definida = convite ainda não aceito. Essa pessoa precisa do
    // link de convite, não do de recuperação; mandar os dois criaria dois
    // caminhos concorrentes para ativar a mesma conta.
    if (!user || !user.password) {
      return;
    }

    const { token, tokenHash, expiresAt } = generatePasswordResetToken(now);
    await userRepository.startPasswordReset(user.id, tokenHash, expiresAt);

    const resetLink = `${env.webOrigin}/redefinir-senha?token=${token}`;
    try {
      await sendPasswordResetEmail({ to: user.email, userName: user.name, resetLink });
    } catch (error) {
      // O token já está gravado e o pedido foi legítimo: falha de envio não
      // pode virar erro para quem pediu, senão a tela sugere tentar de novo e
      // o problema real (e-mail fora do ar) fica invisível.
      console.error(`Falha ao enviar recuperação de senha para ${user.email}:`, error);
    }
  },

  async resetPassword(token: string, password: string, now: Date) {
    const user = await userRepository.findByPasswordResetTokenHash(
      hashPasswordResetToken(token),
    );

    const isExpired = !user?.passwordResetExpiresAt || user.passwordResetExpiresAt < now;
    if (!user || isExpired) {
      throw new UnauthorizedError("Link de recuperação inválido ou expirado");
    }

    return userRepository.finishPasswordReset(user.id, await hashPassword(password));
  },

  async getProfile(userId: number) {
    const user = await userRepository.findByIdWithBusiness(userId);
    if (!user) {
      throw new UnauthorizedError("Invalid or missing token");
    }

    // A key nunca sai para o cliente: o front recebe URL pronta e não sabe
    // nada sobre o bucket.
    const { avatarKey, business, ...rest } = user;

    return {
      ...rest,
      avatarUrl: imageService.imageUrl(avatarKey),
      business: business
        ? {
            id: business.id,
            name: business.name,
            slug: business.slug,
            address: business.address,
            planName: business.planName,
            subscriptionStatus: business.subscriptionStatus,
            logoUrl: imageService.imageUrl(business.logoKey),
            bannerUrl: imageService.imageUrl(business.bannerKey),
          }
        : null,
    };
  },
};
