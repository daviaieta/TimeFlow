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

  findById(id: number) {
    return prisma.business.findUnique({ where: { id } });
  },

  // Sem relações: as contagens vêm de queries próprias, para não puxar uma
  // linha de usuário por negócio.
  findAll() {
    return prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
  },

  // Catálogo público: serviços com os profissionais que os oferecem.
  // password not-null = convite aceito; pendente não tem agenda.
  findBySlugWithCatalog(slug: string) {
    return prisma.business.findUnique({
      where: { slug },
      include: {
        services: {
          orderBy: { name: "asc" },
          include: {
            employees: {
              where: { employee: { password: { not: null } } },
              include: { employee: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
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
