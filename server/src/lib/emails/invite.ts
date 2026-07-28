import { escapeHtml, renderEmail } from "../emailLayout";
import { sendMail } from "../mailer";

interface InviteEmailInput {
  to: string;
  adminName: string;
  businessName: string;
  inviteLink: string;
}

const EXPIRY_NOTE =
  "O link expira em 48 horas. Se você não esperava este convite, ignore este e-mail.";

export function sendInviteEmail(input: InviteEmailInput): Promise<void> {
  const { to, adminName, businessName, inviteLink } = input;

  return sendMail({
    to,
    subject: `Você foi convidado para gerenciar ${businessName} no Time Flow`,
    html: renderEmail({
      heading: `Olá, ${escapeHtml(adminName)}!`,
      bodyHtml: `
        <p style="margin: 0 0 12px;">
          Você foi convidado para administrar <strong>${escapeHtml(businessName)}</strong> no Time Flow.
        </p>
        <p style="margin: 0;">Para ativar sua conta, defina sua senha pelo link abaixo:</p>
      `,
      cta: { label: "Definir minha senha", url: inviteLink },
      footnote: EXPIRY_NOTE,
    }),
  });
}

interface EmployeeInviteEmailInput {
  to: string;
  employeeName: string;
  businessName: string;
  inviteLink: string;
}

export function sendEmployeeInviteEmail(input: EmployeeInviteEmailInput): Promise<void> {
  const { to, employeeName, businessName, inviteLink } = input;

  return sendMail({
    to,
    subject: `Você foi convidado para a equipe de ${businessName} no Time Flow`,
    html: renderEmail({
      heading: `Olá, ${escapeHtml(employeeName)}!`,
      bodyHtml: `
        <p style="margin: 0 0 12px;">
          Você foi convidado para fazer parte da equipe de <strong>${escapeHtml(businessName)}</strong> no Time Flow.
        </p>
        <p style="margin: 0;">Para ativar sua conta, defina sua senha pelo link abaixo:</p>
      `,
      cta: { label: "Definir minha senha", url: inviteLink },
      footnote: EXPIRY_NOTE,
    }),
  });
}
