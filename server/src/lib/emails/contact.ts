import { escapeHtml, renderEmail } from "../emailLayout";
import { sendMail } from "../mailer";

interface ContactNotificationInput {
  to: string;
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  teamSize: string | null;
  message: string;
}

function row(label: string, value: string | null): string {
  if (!value) return "";
  return `<p style="margin: 0 0 8px;"><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
}

export function sendContactNotificationEmail(
  input: ContactNotificationInput,
): Promise<void> {
  return sendMail({
    to: input.to,
    // replyTo no lead: responder no cliente de e-mail já cai na pessoa certa,
    // sem copiar endereço à mão.
    replyTo: input.email,
    subject: `Novo contato pelo site: ${input.name}`,
    html: renderEmail({
      heading: "Novo contato pelo site",
      bodyHtml: `
        ${row("Nome", input.name)}
        ${row("E-mail", input.email)}
        ${row("WhatsApp", input.phone)}
        ${row("Negócio", input.businessName)}
        ${row("Profissionais", input.teamSize)}
        <p style="margin: 16px 0 4px;"><strong>Mensagem:</strong></p>
        <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(input.message)}</p>
      `,
      footnote: "Responder este e-mail vai direto para quem escreveu.",
    }),
  });
}

interface ContactAutoReplyInput {
  to: string;
}

export function sendContactAutoReplyEmail(
  input: ContactAutoReplyInput,
): Promise<void> {
  return sendMail({
    to: input.to,
    subject: "Recebemos sua mensagem — Time Flow",
    html: renderEmail({
      // Sem o nome informado no formulário: qualquer um pode submeter
      // /public/contact com o e-mail de terceiro e um "name" hostil, e este
      // e-mail sairia do domínio verificado do Time Flow para essa vítima.
      heading: "Olá!",
      bodyHtml: `
        <p style="margin: 0 0 12px;">
          Recebi sua mensagem e respondo em até 1 dia útil, pessoalmente.
        </p>
        <p style="margin: 0;">
          Se for urgente, é só responder este e-mail com mais detalhes do seu
          negócio — quanto mais contexto, mais direta fica a resposta.
        </p>
      `,
      footnote: "Este e-mail é automático, mas a resposta não será.",
    }),
  });
}
