import { Role } from "@prisma/client";
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
        business: { select: { id: true, name: true, slug: true, address: true } },
      },
    });
  },

  findByInviteToken(inviteToken: string) {
    return prisma.user.findUnique({ where: { inviteToken } });
  },

  findById(id: number) {
    return prisma.user.findUnique({ where: { id } });
  },

  resetInviteToken(id: number, inviteToken: string, inviteTokenExpiresAt: Date) {
    return prisma.user.update({
      where: { id },
      data: { inviteToken, inviteTokenExpiresAt },
    });
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
  // role: ADMIN porque este painel rastreia se o NEGÓCIO já foi reivindicado
  // pelo seu admin. Convites de funcionário pendentes (password null também)
  // são assunto da própria tela de Equipe do admin — incluí-los aqui infla o
  // card de "convites pendentes" e pode fazer o botão de reenvio mirar na
  // pessoa errada.
  findPendingInvites() {
    return prisma.user.findMany({
      where: { businessId: { not: null }, password: null, role: Role.ADMIN },
      select: { id: true, name: true, email: true, role: true, businessId: true },
    });
  },
};
