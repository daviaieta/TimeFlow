import { FastifyReply, FastifyRequest } from "fastify";
import { User } from "@prisma/client";
import { authService } from "../services/authService";

interface LoginBody {
  email: string;
  password: string;
}

interface AcceptInviteBody {
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

export async function me(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = await authService.getProfile(request.user.sub);

  reply.send({ user });
}
