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

  // groupBy em vez de _count por negócio: o Prisma aceita um único filtro por
  // relação em cada chave de _count, e aqui são dois recortes do mesmo `users`.
  countByBusinessAndRole() {
    return prisma.user.groupBy({
      by: ["businessId", "role"],
      where: { businessId: { not: null } },
      _count: { _all: true },
    });
  },

  // Lista e não contagem: o botão de reenvio precisa do id do convidado.
  // password null = convite ainda não aceito.
  findPendingInvites() {
    return prisma.user.findMany({
      where: { businessId: { not: null }, password: null },
      select: { id: true, name: true, email: true, role: true, businessId: true },
    });
  },
};
