import { escapeHtml, renderEmail } from "../emailLayout";
import { sendMail } from "../mailer";
import { PASSWORD_RESET_TTL_LABEL } from "../passwordResetToken";

interface PasswordResetEmailInput {
  to: string;
  userName: string;
  resetLink: string;
}

// O aviso de "ignore este e-mail" não é formalidade: quem recebe isto sem ter
// pedido precisa saber que não há nada a fazer, já que a senha atual continua
// valendo até o link ser usado.
const EXPIRY_NOTE = `O link expira em ${PASSWORD_RESET_TTL_LABEL} e só pode ser usado uma vez. Se você não pediu para redefinir sua senha, ignore este e-mail — sua senha atual continua valendo.`;

export function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  const { to, userName, resetLink } = input;

  return sendMail({
    to,
    subject: "Redefinir sua senha do Time Flow",
    html: renderEmail({
      heading: `Olá, ${escapeHtml(userName)}!`,
      bodyHtml: `
        <p style="margin: 0;">
          Recebemos um pedido para redefinir a senha da sua conta no Time Flow.
          Use o botão abaixo para escolher uma nova.
        </p>
      `,
      cta: { label: "Redefinir minha senha", url: resetLink },
      footnote: EXPIRY_NOTE,
    }),
  });
}
