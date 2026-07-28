import { toMinutes, toTime } from "../time";
import { escapeHtml, renderEmail } from "../emailLayout";
import { sendMail } from "../mailer";

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

// Leitura em UTC porque o slot é gravado à meia-noite UTC: usar o fuso do
// servidor faria a reserva aparecer no dia anterior.
export function formatBookingDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]}, ${day}/${month}/${date.getUTCFullYear()}`;
}

export function bookingTimeRange(startTime: string, durationMinutes: number): string {
  const end = toTime((toMinutes(startTime) + durationMinutes) % (24 * 60));
  return `${startTime} às ${end}`;
}

interface BookingConfirmationInput {
  to: string;
  clientName: string;
  businessName: string;
  businessAddress: string | null;
  serviceName: string;
  employeeName: string;
  date: Date;
  startTime: string;
  durationMinutes: number;
}

function row(label: string, value: string): string {
  return `<p style="margin: 0 0 8px;"><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
}

export function sendBookingConfirmationEmail(
  input: BookingConfirmationInput,
): Promise<void> {
  return sendMail({
    to: input.to,
    subject: `Reserva confirmada — ${input.businessName}`,
    html: renderEmail({
      heading: `Olá, ${escapeHtml(input.clientName)}!`,
      bodyHtml: `
        <p style="margin: 0 0 16px;">Sua reserva está confirmada.</p>
        ${row("Negócio", input.businessName)}
        ${row("Serviço", input.serviceName)}
        ${row("Profissional", input.employeeName)}
        ${row("Data", formatBookingDate(input.date))}
        ${row("Horário", bookingTimeRange(input.startTime, input.durationMinutes))}
        ${input.businessAddress ? row("Endereço", input.businessAddress) : ""}
      `,
      footnote: "Precisa remarcar? Fale direto com o estabelecimento.",
    }),
  });
}
