import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors";
import { comparePassword, hashPassword } from "../lib/password";
import { userRepository } from "../repositories/userRepository";
import { normalizeEmail, requiresCurrentPassword } from "./accountRules";

interface UpdateProfileInput {
  name: string;
  email: string;
  currentPassword?: string;
}

export const accountService = {
  async updateProfile(userId: number, input: UpdateProfileInput) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const nextEmail = normalizeEmail(input.email);
    const emailChanged = requiresCurrentPassword(normalizeEmail(user.email), nextEmail);

    // Só a troca de e-mail paga o pedágio da senha: nome é dado de exibição.
    if (emailChanged) {
      if (!input.currentPassword) {
        throw new BadRequestError("Current password is required to change the email");
      }

      // Convite ainda não aceito não tem senha para conferir — não há como
      // provar identidade, então a troca não passa.
      if (
        !user.password ||
        !(await comparePassword(input.currentPassword, user.password))
      ) {
        throw new UnauthorizedError("Invalid credentials");
      }

      const taken = await userRepository.findByEmail(nextEmail);
      if (taken && taken.id !== userId) {
        throw new ConflictError("A user with this email already exists");
      }
    }

    // Sem essa guarda, salvar só o nome reescreveria o e-mail já gravado com
    // a normalização atual (lowercase) sem pedir senha — e como o login busca
    // por igualdade exata, isso destrava a troca de e-mail sem senha e ainda
    // pode travar o login de quem digitava o e-mail com maiúsculas.
    await userRepository.updateProfile(userId, {
      name: input.name.trim(),
      email: emailChanged ? nextEmail : user.email,
    });

    // Devolve o mesmo shape de GET /auth/me para o cliente atualizar o
    // contexto sem uma segunda ida ao servidor.
    return userRepository.findByIdWithBusiness(userId);
  },

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Sem senha gravada o convite nunca foi aceito: não há o que conferir, e
    // deixar passar seria uma porta para definir senha sem o token do convite.
    if (
      !user.password ||
      !(await comparePassword(currentPassword, user.password))
    ) {
      throw new UnauthorizedError("Invalid credentials");
    }

    await userRepository.updatePassword(userId, await hashPassword(newPassword));
  },
};
