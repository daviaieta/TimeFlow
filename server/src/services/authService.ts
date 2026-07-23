import { comparePassword, hashPassword } from "../lib/password";
import { UnauthorizedError } from "../lib/errors";
import { userRepository } from "../repositories/userRepository";

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

  async getProfile(userId: number) {
    const user = await userRepository.findByIdWithBusiness(userId);
    if (!user) {
      throw new UnauthorizedError("Invalid or missing token");
    }

    return user;
  },
};
