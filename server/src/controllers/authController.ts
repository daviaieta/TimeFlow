import { FastifyReply, FastifyRequest } from "fastify";
import { User } from "@prisma/client";
import { env } from "../config/env";
import { accountService } from "../services/accountService";
import { authService } from "../services/authService";

interface LoginBody {
  email: string;
  password: string;
}

interface AcceptInviteBody {
  token: string;
  password: string;
}

export interface UpdateMeBody {
  name: string;
  email: string;
  currentPassword?: string;
}

export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordBody {
  email: string;
}

export interface ResetPasswordBody {
  token: string;
  password: string;
}

async function sendAuthToken(reply: FastifyReply, user: User): Promise<void> {
  const token = await reply.jwtSign({
    sub: user.id,
    role: user.role,
    businessId: user.businessId,
  });

  reply.send({ token });
}

export async function login(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { email, password } = request.body;

  const user = await authService.login(email, password);

  await sendAuthToken(reply, user);
}

export async function acceptInvite(
  request: FastifyRequest<{ Body: AcceptInviteBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { token, password } = request.body;

  const user = await authService.acceptInvite(token, password);

  await sendAuthToken(reply, user);
}

export async function forgotPassword(
  request: FastifyRequest<{ Body: ForgotPasswordBody }>,
  reply: FastifyReply,
): Promise<void> {
  await authService.requestPasswordReset(request.body.email, request.ip, new Date());

  // 204 sempre, inclusive para e-mail que não existe: a resposta não pode
  // deixar descobrir quem tem conta. A tela diz "se este e-mail estiver
  // cadastrado, enviamos o link".
  reply.status(204).send();
}

export async function resetPassword(
  request: FastifyRequest<{ Body: ResetPasswordBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { token, password } = request.body;

  // Devolve token de sessão como o accept-invite: quem acabou de provar que
  // controla o e-mail e definiu a senha não precisa digitá-la de novo.
  const user = await authService.resetPassword(token, password, new Date());

  await sendAuthToken(reply, user);
}

export async function me(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = await authService.getProfile(request.user.sub);

  // O front precisa saber se a cobrança está valendo para não empurrar
  // ninguém para a tela de assinatura durante o período de cortesia. Vem do
  // servidor, e não de uma variável do front, para não existirem duas fontes
  // de verdade que podem discordar.
  reply.send({ user, billingEnabled: env.billingEnabled });
}

export async function updateMe(
  request: FastifyRequest<{ Body: UpdateMeBody }>,
  reply: FastifyReply,
): Promise<void> {
  const user = await accountService.updateProfile(request.user.sub, request.body);

  reply.send({ user });
}

export async function changePassword(
  request: FastifyRequest<{ Body: ChangePasswordBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { currentPassword, newPassword } = request.body;

  await accountService.changePassword(request.user.sub, currentPassword, newPassword);

  reply.status(204).send();
}
