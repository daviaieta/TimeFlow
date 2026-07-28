import { Resend } from "resend";
import { env } from "../config/env";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  // Notificação de contato usa isto para "Responder" cair direto no lead.
  replyTo?: string;
}

interface MailerConfig {
  apiKey: string | null;
  from: string;
  logger?: Pick<Console, "log" | "error">;
  // Default vem do ambiente real; testes passam o valor explícito para não
  // depender de NODE_ENV do processo de teste.
  isProduction?: boolean;
}

// Fábrica em vez de função solta: é o que permite testar o modo console sem
// credencial e sem tocar em process.env dentro do teste.
export function createMailer(config: MailerConfig) {
  const logger = config.logger ?? console;
  const client = config.apiKey ? new Resend(config.apiKey) : null;
  const isProduction = config.isProduction ?? env.nodeEnv === "production";

  return async function send(input: SendMailInput): Promise<void> {
    if (!client) {
      // Modo desenvolvimento: nada sai da máquina. O corpo inteiro polui o
      // terminal, então só o cabeçalho e os links vão para o log.
      logger.log(`[mailer] modo console — para: ${input.to} | assunto: ${input.subject}`);
      // Em produção isto não deveria acontecer (ver aviso no boot em
      // server.ts), mas se acontecer, os links — inclusive token de convite —
      // não podem ir parar no log de produção.
      if (!isProduction) {
        for (const link of extractLinks(input.html)) {
          logger.log(`[mailer] link: ${link}`);
        }
      }
      return;
    }

    const { error } = await client.emails.send({
      from: config.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    // O SDK devolve o erro no retorno em vez de lançar: sem esta checagem, um
    // envio recusado passaria por bem-sucedido.
    if (error) {
      throw new Error(`Resend recusou o envio: ${error.message}`);
    }
  };
}

function extractLinks(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

export const sendMail = createMailer({
  apiKey: env.resendApiKey,
  from: env.mailFrom,
});
