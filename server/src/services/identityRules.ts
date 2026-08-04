import { CustomerIdentityState } from "@prisma/client";

// Decisão pura de identidade do CRM (§4 do documento de arquitetura). Nada
// aqui toca no banco: o repositório faz as buscas e traz o resultado, estas
// funções só decidem. É o pedaço mais sensível do CRM à segurança, e é por
// isso que ele é testável sem banco.

export function normalizeEmail(value?: string | null): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;
  // Validação mínima e deliberadamente burra: o schema JSON da rota pública já
  // exige `format: email`, e o caminho interno é digitado pela atendente. O que
  // importa aqui é não gravar como identidade algo que claramente não é
  // endereço — um "@" no meio, sem espaço.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

// E.164 com escopo declarado: Brasil. O produto opera num país só (é a mesma
// premissa do fuso único registrada em bookingRules), e não há dependência de
// telefonia no projeto.
//
// Devolve null em vez de um palpite quando não reconhece o formato: gravar meio
// normalizado é pior que não gravar. "(11) 99999-8888", "+5511999998888" e
// "11999998888" são a MESMA pessoa, e um deles gravado cru viraria uma terceira
// identidade (§15.11).
//
// Quando entrar provedor de SMS — e com ele número internacional e verificação
// de telefone de verdade — esta função vira uma chamada a libphonenumber-js. A
// assinatura já é a dessa troca.
export function normalizePhoneE164(value?: string | null): string | null {
  const digits = value?.replace(/\D/g, "");
  if (!digits) return null;

  // Já vem com código do país.
  if (digits.length === 13 && digits.startsWith("55")) return `+${digits}`;
  // Fixo com DDD + 8 dígitos, ou celular com DDD + 9. DDD brasileiro começa
  // em 11: nada abaixo disso é DDD válido, e aceitar seria inventar número.
  if (digits.length === 11 || digits.length === 10) {
    const ddd = Number(digits.slice(0, 2));
    if (ddd < 11 || ddd > 99) return null;
    return `+55${digits}`;
  }
  // 12 dígitos com 55 na frente é fixo com código do país.
  if (digits.length === 12 && digits.startsWith("55")) return `+${digits}`;

  return null;
}

export type IdentityChannel = "EMAIL" | "PHONE";

export interface ExistingCustomer {
  id: number;
  state: CustomerIdentityState;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  mergedIntoId: number | null;
}

// O predicado que sustenta §11.1, e o único lugar onde a resposta é decidida.
//
// Um e-mail NÃO verificado não é identidade, é reivindicação. Se ele valesse
// como identidade, bastaria registrar o e-mail da vítima e nunca confirmar:
// toda reserva futura dela, em qualquer negócio, passaria a pertencer à conta
// do atacante — que então faz login e lê o histórico dela em todos os negócios.
//
// Só duas situações autorizam reusar uma identidade que já existe:
//
//   1. Ela está ACTIVE e o canal pelo qual a encontramos está VERIFICADO nela.
//      Esta é a única forma de vínculo que atravessa negócios.
//   2. Ela é PROVISIONAL e já está ligada a ESTE negócio — é o mesmo cliente
//      de balcão voltando. Não atravessa negócio nenhum.
//
// Qualquer outra combinação devolve false, e quem chama cria estado
// provisional isolado. Na dúvida, duas identidades separadas custam uma fusão
// futura; uma fusão errada custa o histórico de alguém.
export function canLinkToExisting(
  customer: ExistingCustomer,
  matchedBy: IdentityChannel,
  alreadyLinkedToThisBusiness: boolean,
): boolean {
  // Identidade fundida em outra nunca é destino: quem vale é a vencedora, e
  // quem chama vai reencontrá-la pelo canal verificado dela.
  if (customer.mergedIntoId !== null) return false;

  if (customer.state === CustomerIdentityState.ACTIVE) {
    const verifiedAt =
      matchedBy === "EMAIL" ? customer.emailVerifiedAt : customer.phoneVerifiedAt;
    return verifiedAt !== null;
  }

  if (customer.state === CustomerIdentityState.PROVISIONAL) {
    return alreadyLinkedToThisBusiness;
  }

  // SUSPENDED e ERASED: nunca recebem vínculo novo. Um cliente apagado não
  // volta a existir porque alguém digitou o e-mail dele numa reserva.
  return false;
}

// Quais canais a identidade nova pode reivindicar. Canal já reivindicado por
// outra identidade (mesmo não verificada) sai como null: a coluna é única
// globalmente, e insistir nele derrubaria a reserva. O valor não se perde —
// continua em Booking.client* e em CustomerProfile.display*, que são o que o
// negócio realmente lê.
export function claimableChannels(
  email: string | null,
  phoneE164: string | null,
  emailTaken: boolean,
  phoneTaken: boolean,
): { email: string | null; phoneE164: string | null } {
  return {
    email: email !== null && !emailTaken ? email : null,
    phoneE164: phoneE164 !== null && !phoneTaken ? phoneE164 : null,
  };
}

// firstBookedAt só é escrito uma vez; lastBookedAt só avança. Reprocessar a
// mesma reserva não pode mover nenhum dos dois para trás — é o que torna o
// bump de agregado idempotente na prática, já que a data vem da requisição.
export function mergeBookingTimestamps(
  current: { firstBookedAt: Date | null; lastBookedAt: Date | null },
  bookedAt: Date,
): { firstBookedAt?: Date; lastBookedAt?: Date } {
  const update: { firstBookedAt?: Date; lastBookedAt?: Date } = {};

  if (current.firstBookedAt === null || bookedAt < current.firstBookedAt) {
    update.firstBookedAt = bookedAt;
  }
  if (current.lastBookedAt === null || bookedAt > current.lastBookedAt) {
    update.lastBookedAt = bookedAt;
  }

  return update;
}

// Preenche campo de exibição que está vazio e NUNCA sobrescreve o que já tem
// valor: displayName/Phone/Email são editáveis pela equipe (§2.3), e uma
// reserva nova não pode desfazer a correção que a atendente fez no cadastro.
export function fillMissingDisplayFields(
  current: { displayPhone: string | null; displayEmail: string | null },
  incoming: { phone: string | null; email: string | null },
): { displayPhone?: string; displayEmail?: string } {
  const update: { displayPhone?: string; displayEmail?: string } = {};

  if (current.displayPhone === null && incoming.phone !== null) {
    update.displayPhone = incoming.phone;
  }
  if (current.displayEmail === null && incoming.email !== null) {
    update.displayEmail = incoming.email;
  }

  return update;
}
