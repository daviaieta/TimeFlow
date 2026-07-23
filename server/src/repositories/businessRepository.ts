import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface CreateWithAdminInput {
  name: string;
  slug: string;
  admin: {
    name: string;
    email: string;
    inviteToken: string;
    inviteTokenExpiresAt: Date;
  };
}

export const businessRepository = {
  findBySlug(slug: string) {
    return prisma.business.findUnique({ where: { slug } });
  },

  createWithAdmin({ name, slug, admin }: CreateWithAdminInput) {
    return prisma.business.create({
      data: {
        name,
        slug,
        users: {
          create: {
            name: admin.name,
            email: admin.email,
            role: Role.ADMIN,
            inviteToken: admin.inviteToken,
            inviteTokenExpiresAt: admin.inviteTokenExpiresAt,
          },
        },
      },
      include: {
        users: true,
      },
    });
  },
};
