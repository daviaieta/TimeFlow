import { prisma } from "../lib/prisma";

export const userRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findByIdWithBusiness(id: number) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        business: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  findByInviteToken(inviteToken: string) {
    return prisma.user.findUnique({ where: { inviteToken } });
  },

  acceptInvite(id: number, hashedPassword: string) {
    return prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });
  },
};
