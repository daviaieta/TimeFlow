import { ContactStatus } from "@prisma/client";
import { env } from "../config/env";
import {
  sendContactAutoReplyEmail,
  sendContactNotificationEmail,
} from "../lib/emails/contact";
import { NotFoundError, TooManyRequestsError } from "../lib/errors";
import { contactRepository } from "../repositories/contactRepository";
import { userRepository } from "../repositories/userRepository";
import {
  CONTACT_RATE_LIMIT,
  ContactInput,
  isBot,
  isRateLimited,
  normalizeContact,
  withinWindow,
} from "./contactRules";

// Em memória de propósito: para o volume atual não vale um Redis, e reiniciar
// o processo zerar a janela é aceitável — o honeypot já segura o grosso.
const hitsByIp = new Map<string, number[]>();

async function resolveInbox(): Promise<string | null> {
  if (env.contactInbox) {
    return env.contactInbox;
  }

  const superadmin = await userRepository.findFirstSuperadmin();
  return superadmin?.email ?? null;
}

export const contactService = {
  async submit(input: ContactInput, ip: string, now: Date): Promise<void> {
    // Resposta idêntica à de sucesso: devolver erro ensinaria o bot qual campo
    // o denunciou.
    if (isBot(input)) {
      return;
    }

    const timestamp = now.getTime();
    const previous = hitsByIp.get(ip) ?? [];
    if (isRateLimited(previous, timestamp, CONTACT_RATE_LIMIT)) {
      throw new TooManyRequestsError(
        "Muitas mensagens em pouco tempo. Tente novamente mais tarde.",
      );
    }
    hitsByIp.set(ip, [
      ...withinWindow(previous, timestamp, CONTACT_RATE_LIMIT.windowMs),
      timestamp,
    ]);

    const contact = normalizeContact(input);

    // Persiste antes de enviar: e-mail que não sai vira log, mensagem que não
    // é salva some para sempre.
    await contactRepository.create(contact);

    const inbox = await resolveInbox();
    if (!inbox) {
      console.error(
        "Contato recebido sem destino: defina CONTACT_INBOX ou cadastre um SUPERADMIN.",
      );
    }

    try {
      if (inbox) {
        await sendContactNotificationEmail({ to: inbox, ...contact });
      }
      await sendContactAutoReplyEmail({ to: contact.email, name: contact.name });
    } catch (error) {
      // A mensagem já está no banco e aparece na caixa do dashboard: falha de
      // envio não pode virar erro para quem preencheu o formulário.
      console.error(`Falha ao enviar e-mails do contato de ${contact.email}:`, error);
    }
  },

  list() {
    return contactRepository.findAll();
  },

  async setStatus(id: number, status: ContactStatus) {
    const message = await contactRepository.findById(id);
    if (!message) {
      throw new NotFoundError("Contact message not found");
    }

    return contactRepository.updateStatus(id, status);
  },
};
