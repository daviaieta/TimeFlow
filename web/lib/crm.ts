import type {
  CustomerBooking,
  CustomerProfile,
  CustomerStatus,
  LoyaltyKind,
} from "./types";

// Lógica pura das telas de CRM. Fica fora dos componentes pelo mesmo motivo do
// resto de `lib/`: dá para testar com `node --test`, sem montar React nem
// chamar a API.

export const customerStatusLabels: Record<CustomerStatus, string> = {
  ACTIVE: "Ativo",
  BLOCKED: "Bloqueado",
};

export const loyaltyKindLabels: Record<LoyaltyKind, string> = {
  EARN: "Ganhou",
  REDEEM: "Resgatou",
  ADJUST: "Ajuste manual",
  EXPIRE: "Expirou",
};

// A listagem é keyset: o servidor manda `nextCursor` e a tela pede a próxima
// página com ele. Montar a query aqui (em vez de concatenar string no
// componente) é o que torna testável o caso que mais quebra na prática —
// filtro ativo + cursor ao mesmo tempo.
export function buildCustomersQuery(input: {
  search?: string;
  status?: CustomerStatus | "ALL";
  tagId?: number | null;
  cursor?: string | null;
  limit?: number;
}): string {
  const params = new URLSearchParams();

  const search = input.search?.trim();
  if (search) params.set("search", search);
  if (input.status && input.status !== "ALL") params.set("status", input.status);
  if (input.tagId != null) params.set("tagId", String(input.tagId));
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit) params.set("limit", String(input.limit));

  const query = params.toString();
  return query ? `?${query}` : "";
}

// Anexa a página seguinte descartando o que já está na tela. O keyset não
// repete itens entre páginas, mas duas requisições disparadas em sequência
// rápida (o usuário clicando duas vezes em "Carregar mais") podem trazer a
// mesma página duas vezes — e uma key duplicada no React é erro de render, não
// um detalhe cosmético.
export function appendProfiles(
  current: CustomerProfile[],
  incoming: CustomerProfile[],
): CustomerProfile[] {
  const seen = new Set(current.map((profile) => profile.publicId));
  return [...current, ...incoming.filter((profile) => !seen.has(profile.publicId))];
}

// Uma linha só para a coluna de contato: telefone é o que o balcão usa, e-mail
// é o complemento. Sem nenhum dos dois, um traço — a célula vazia parece bug.
export function customerContactLine(profile: {
  displayPhone: string | null;
  displayEmail: string | null;
}): string {
  const parts = [profile.displayPhone, profile.displayEmail].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length > 0 ? parts.join(" · ") : "—";
}

// Dois formatadores porque são duas coisas diferentes, e confundi-las é como
// nasce o bug de "a reserva aparece um dia antes":
//   - instantes (createdAt, lastBookedAt) são momentos reais → fuso local;
//   - o dia da agenda é gravado como meia-noite UTC e representa um DIA de
//     calendário, não um instante → tem que ser lido em UTC, igual ao resto do
//     painel (ver `lib/dashboard.ts`).
const instantFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const calendarDayFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return instantFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatCalendarDay(iso: string | null): string {
  if (!iso) return "—";
  return calendarDayFormatter.format(new Date(iso));
}

// A reserva guarda a data no slot e o horário como "HH:MM". Juntar os dois é
// tela, não regra: a API já entrega os dois campos separados.
export function formatBookingWhen(booking: CustomerBooking): string {
  if (!booking.date) return "—";
  const day = formatCalendarDay(booking.date);
  if (!booking.startTime) return day;
  return `${day} às ${booking.startTime}`;
}

// Pontos ganham sinal explícito: "+50" e "−20" se distinguem numa lista de
// lançamentos, "50" e "-20" alinhados à esquerda não.
export function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : `−${Math.abs(points)}`;
}

// O ADJUST aceita pontos negativos, mas não zero, e exige motivo. Espelha
// `validateLoyaltyAdjust` do servidor para o erro aparecer antes do request —
// o servidor continua sendo quem decide.
export function validateAdjustForm(input: { points: string; reason: string }):
  | { ok: true; points: number; reason: string }
  | { ok: false; message: string } {
  const points = Number(input.points.trim());
  if (!Number.isInteger(points) || points === 0) {
    return { ok: false, message: "Informe um número inteiro diferente de zero." };
  }

  const reason = input.reason.trim();
  if (reason.length < 3) {
    return { ok: false, message: "Descreva o motivo do ajuste (mínimo 3 caracteres)." };
  }
  if (reason.length > 200) {
    return { ok: false, message: "O motivo é longo demais (máximo 200 caracteres)." };
  }

  return { ok: true, points, reason };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isValidTagColor(color: string): boolean {
  return HEX_COLOR.test(color);
}
