// Layout único de todos os e-mails transacionais. HTML em tabela e estilo
// inline de propósito: cliente de e-mail ignora <style> externo e flexbox.
interface EmailLayoutInput {
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footnote?: string;
}

const INDIGO = "#4338ca";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEmail({ heading, bodyHtml, cta, footnote }: EmailLayoutInput): string {
  const ctaHtml = cta
    ? `<p style="margin: 24px 0;">
         <a href="${cta.url}" style="display: inline-block; background: ${INDIGO}; color: #ffffff; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 500;">${cta.label}</a>
       </p>`
    : "";

  const footnoteHtml = footnote
    ? `<p style="margin: 24px 0 0; color: #71717a; font-size: 13px;">${footnote}</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin: 0; padding: 24px; background: #f4f4f5; font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden;">
      <tr>
        <td style="background: ${INDIGO}; padding: 20px 32px; color: #ffffff; font-size: 18px; font-weight: 600;">Time Flow</td>
      </tr>
      <tr>
        <td style="padding: 32px;">
          <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 600;">${heading}</h1>
          ${bodyHtml}
          ${ctaHtml}
          ${footnoteHtml}
        </td>
      </tr>
      <tr>
        <td style="padding: 20px 32px; background: #fafafa; color: #a1a1aa; font-size: 12px;">
          Time Flow — sua agenda online, sem conflito de horário.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
