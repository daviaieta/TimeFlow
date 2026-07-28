import { ContactMessage, ContactStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface CreateContactInput {
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  teamSize: string | null;
  message: string;
}

export const contactRepository = {
  create(input: CreateContactInput): Promise<ContactMessage> {
    return prisma.contactMessage.create({ data: input });
  },

  // Novas primeiro: a caixa é lida de cima para baixo.
  findAll(): Promise<ContactMessage[]> {
    return prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" } });
  },

  findById(id: number): Promise<ContactMessage | null> {
    return prisma.contactMessage.findUnique({ where: { id } });
  },

  updateStatus(id: number, status: ContactStatus): Promise<ContactMessage> {
    return prisma.contactMessage.update({ where: { id }, data: { status } });
  },
};
