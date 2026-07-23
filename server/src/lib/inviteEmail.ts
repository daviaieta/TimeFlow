import { sendMail } from "./mailer";

interface InviteEmailInput {
  to: string;
  adminName: string;
  businessName: string;
  inviteLink: string;
}

export function sendInviteEmail(input: InviteEmailInput): Promise<void> {
  const { to, adminName, businessName, inviteLink } = input;

  return sendMail({
    to,
    subject: `Você foi convidado para gerenciar ${businessName} no Time Flow`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Olá, ${adminName}!</h2>
        <p>
          Você foi convidado para administrar <strong>${businessName}</strong>
          no Time Flow.
        </p>
        <p>Para ativar sua conta, defina sua senha pelo link abaixo:</p>
        <p>
          <a
            href="${inviteLink}"
            style="display: inline-block; background: #4338ca; color: #fff; padding: 12px 24px; border-radius: 9999px; text-decoration: none;"
          >
            Definir minha senha
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">
          O link expira em 48 horas. Se você não esperava este convite, ignore este e-mail.
        </p>
      </div>
    `,
  });
}
