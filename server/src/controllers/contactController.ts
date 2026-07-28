import { ContactStatus } from "@prisma/client";
import { FastifyReply, FastifyRequest } from "fastify";
import { contactService } from "../services/contactService";

export interface ContactBody {
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  teamSize?: string;
  message: string;
  website?: string;
}

export interface ContactStatusParams {
  id: number;
}

export interface ContactStatusBody {
  status: ContactStatus;
}

export async function createContactMessage(
  request: FastifyRequest<{ Body: ContactBody }>,
  reply: FastifyReply,
): Promise<void> {
  await contactService.submit(request.body, request.ip, new Date());
  reply.status(201).send({ received: true });
}

export async function listContactMessages(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const messages = await contactService.list();
  reply.send({ messages });
}

export async function updateContactMessageStatus(
  request: FastifyRequest<{ Params: ContactStatusParams; Body: ContactStatusBody }>,
  reply: FastifyReply,
): Promise<void> {
  const message = await contactService.setStatus(
    request.params.id,
    request.body.status,
  );
  reply.send({ message });
}
