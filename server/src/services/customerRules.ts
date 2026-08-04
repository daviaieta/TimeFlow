// Decisões puras da fase 4 (CRM de negócio). Sem Prisma: testa em node:test
// sem banco, e a leitura da camada de regra não força a abrir conexão.
//
// O que mora aqui:
//   - codificação/decodificação de cursor de paginação por chave (§13.3);
//   - validação de campos de etiqueta (hex, tamanho, nome);
//   - regra de ADJUST manual de fidelidade: precisa de motivo, idempotência,
//     ADMIN-only (a guarda do papel fica no middleware; a regra do motivo e do
//     sinal fica aqui para que unit test pegue);
//   - tipos da fronteira de regra pura.
//
// O que NÃO mora aqui: qualquer coisa que precise de uma linha do banco. O
// cursor é opaco e validado por formato; quem decide o que vem depois é o
// repositório.

import { CustomerProfileStatus, LoyaltyEntryKind } from "@prisma/client";
import { normalizeEmail, normalizePhoneE164 } from "./identityRules";

// -----------------------------------------------------------------------------
// Pagination
// -----------------------------------------------------------------------------

// (sortKey, lastBookedAt, id) como tupla opaca. Codificada em base64-url
// para que "letra aleatória" não bata em nada que o cliente consiga adivinhar
// — o que importa é que decodificação maliciosa seja recusada pela regex, não
// que o conteúdo seja secreto.
//
// `displayName` é só da ordenação por nome: o ORDER BY começa por ele, então
// o WHERE do keyset precisa dele para a comparação ser completa. Não é dado
// sensível: o próprio dashboard já o renderizou na página anterior.
export interface ProfileCursor {
  lastBookedAt: Date;
  id: number;
  displayName: string;
}

const CURSOR_PREFIX = "p2:"; // versão 2; trocar se mudar o shape

export function encodeProfileCursor(cursor: ProfileCursor): string {
  // timestampMs inteiro e id inteiro: composição determinística. O nome é o
  // terceiro campo — só é usado pelo sort por nome.
  const payload = `${CURSOR_PREFIX}${cursor.lastBookedAt.getTime()}|${cursor.id}|${cursor.displayName}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid cursor");
  }
}

export function decodeProfileCursor(raw: string | null | undefined): ProfileCursor | null {
  if (raw === null || raw === undefined || raw === "") return null;

  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw new InvalidCursorError();
  }

  // A regex valida o shape. Nada além do que encodeProfileCursor produz.
  // O nome pode conter `|`, então a regex tem que pegar do terceiro `|` em
  // diante como resto.
  const match = /^p2:(-?\d+)\|(-?\d+)\|(.*)$/s.exec(decoded);
  if (!match) throw new InvalidCursorError();

  const timestamp = Number(match[1]);
  const id = Number(match[2]);
  if (!Number.isFinite(timestamp) || !Number.isFinite(id)) throw new InvalidCursorError();
  if (!Number.isInteger(id) || id < 0) throw new InvalidCursorError();

  return { lastBookedAt: new Date(timestamp), id, displayName: match[3] ?? "" };
}

// O tamanho da página tem teto baixo: a tela do painel lê uma página de cada
// vez e rolagem infinita é o que §13.3 pede. 100 é mais que suficiente e
// abaixo do que um cursor "OFFSET 50" aceitaria sem reclamar.
export const PROFILE_PAGE_SIZE = 20;
export const PROFILE_PAGE_SIZE_MAX = 100;

export function clampPageSize(raw: number | undefined): number {
  if (raw === undefined) return PROFILE_PAGE_SIZE;
  if (!Number.isInteger(raw) || raw <= 0) return PROFILE_PAGE_SIZE;
  return Math.min(raw, PROFILE_PAGE_SIZE_MAX);
}

// Ordenação da lista de prontuários. Recente é o que o painel usa, mas busca
// por nome é o que o atendente usa no balcão. Dois caminhos explícitos em vez
// de "ORDER BY lastBookedAt DESC" cego.
export type ProfileSort = "recent" | "name";

export function parseProfileSort(raw: string | undefined): ProfileSort {
  return raw === "name" ? "name" : "recent";
}

// -----------------------------------------------------------------------------
// Status
// -----------------------------------------------------------------------------

export function parseProfileStatus(raw: string | undefined): CustomerProfileStatus | null {
  if (raw === undefined) return null;
  if (raw === "ACTIVE" || raw === "BLOCKED") return raw;
  return null;
}

// -----------------------------------------------------------------------------
// Cadastro pela equipe (passo 5)
// -----------------------------------------------------------------------------

export class InvalidCustomerError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export const DISPLAY_NAME_MAX = 120;
export const DISPLAY_PHONE_MAX = 32;
export const DISPLAY_EMAIL_MAX = 160;

export interface CreateCustomerInput {
  displayName: string;
  displayPhone?: string | null;
  displayEmail?: string | null;
}

// Duas faces do mesmo dado, de propósito:
//   - display*: o que a atendente digitou, que é o que o negócio lê e para onde
//     ele liga. Nunca é reescrito por normalização.
//   - email/phoneE164: a forma canônica, e é SÓ ela que participa da resolução
//     de identidade (§4.1). "(11) 99999-8888" e "+5511999998888" são a mesma
//     pessoa; gravar o cru como canal criaria uma terceira identidade (§15.11).
export interface ValidatedCustomerInput {
  displayName: string;
  displayPhone: string | null;
  displayEmail: string | null;
  email: string | null;
  phoneE164: string | null;
}

function trimmedOrNull(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length < 1) throw new InvalidCustomerError("Nome é obrigatório");
  if (trimmed.length > DISPLAY_NAME_MAX) throw new InvalidCustomerError("Nome é longo demais");
  return trimmed;
}

// Diferença deliberada em relação à reserva pública: lá, um telefone que o
// normalizador não reconhece vira `phoneE164 = null` em silêncio (a reserva não
// pode falhar por causa disso, e o número digitado ainda vale como contato).
// Aqui a origem é a atendente com o cliente na frente, então o erro de digitação
// volta como 400 em vez de virar um cadastro sem canal — que depois não casaria
// com a reserva do mesmo cliente e viraria prontuário duplicado.
function channelOrThrow(
  display: string | null,
  normalize: (value: string) => string | null,
  message: string,
): string | null {
  if (display === null) return null;
  const normalized = normalize(display);
  if (normalized === null) throw new InvalidCustomerError(message);
  return normalized;
}

export function validateCreateCustomer(input: CreateCustomerInput): ValidatedCustomerInput {
  const displayName = requireDisplayName(input.displayName);

  const displayPhone = trimmedOrNull(input.displayPhone);
  const displayEmail = trimmedOrNull(input.displayEmail);
  if (displayPhone !== null && displayPhone.length > DISPLAY_PHONE_MAX) {
    throw new InvalidCustomerError("Telefone é longo demais");
  }
  if (displayEmail !== null && displayEmail.length > DISPLAY_EMAIL_MAX) {
    throw new InvalidCustomerError("E-mail é longo demais");
  }

  return {
    displayName,
    displayPhone,
    displayEmail,
    email: channelOrThrow(displayEmail, normalizeEmail, "E-mail inválido"),
    phoneE164: channelOrThrow(displayPhone, normalizePhoneE164, "Telefone inválido"),
  };
}

// PATCH: só o que veio no corpo é tocado. `undefined` é "não mexe";
// `null` é "apaga o campo" — a distinção existe porque limpar um telefone
// errado é uma operação legítima do balcão, e sem ela a equipe só conseguiria
// sobrescrever, nunca corrigir para vazio.
export interface UpdateCustomerInput {
  displayName?: string;
  displayPhone?: string | null;
  displayEmail?: string | null;
  status?: string;
}

export interface ValidatedCustomerPatch {
  displayName?: string;
  displayPhone?: string | null;
  displayEmail?: string | null;
  status?: CustomerProfileStatus;
}

export function validateUpdateCustomer(input: UpdateCustomerInput): ValidatedCustomerPatch {
  const patch: ValidatedCustomerPatch = {};

  if (input.displayName !== undefined) {
    patch.displayName = requireDisplayName(input.displayName);
  }

  if (input.displayPhone !== undefined) {
    const displayPhone = trimmedOrNull(input.displayPhone);
    if (displayPhone !== null) {
      if (displayPhone.length > DISPLAY_PHONE_MAX) {
        throw new InvalidCustomerError("Telefone é longo demais");
      }
      // Mesma exigência da criação: o que a equipe grava tem que ser
      // reconhecível como telefone, senão a próxima reserva do mesmo cliente
      // não encontra este prontuário.
      channelOrThrow(displayPhone, normalizePhoneE164, "Telefone inválido");
    }
    patch.displayPhone = displayPhone;
  }

  if (input.displayEmail !== undefined) {
    const displayEmail = trimmedOrNull(input.displayEmail);
    if (displayEmail !== null) {
      if (displayEmail.length > DISPLAY_EMAIL_MAX) {
        throw new InvalidCustomerError("E-mail é longo demais");
      }
      channelOrThrow(displayEmail, normalizeEmail, "E-mail inválido");
    }
    patch.displayEmail = displayEmail;
  }

  if (input.status !== undefined) {
    const status = parseProfileStatus(input.status);
    if (status === null) throw new InvalidCustomerError("Status inválido");
    patch.status = status;
  }

  // Corpo vazio não é uma edição — é um pedido malformado. Deixar passar
  // devolveria 200 sem ter feito nada, que é a resposta mais confusa possível.
  if (Object.keys(patch).length === 0) {
    throw new InvalidCustomerError("Nada para atualizar");
  }

  return patch;
}

// NOTA: o PATCH mexe SÓ no prontuário deste negócio. Os canais canônicos do
// `Customer` (email/phoneE164 globais, únicos) não são reescritos daqui — o
// painel nunca escreve na identidade global (§4, fase 5). Editar o telefone
// aqui muda para onde ESTE negócio liga, não quem a pessoa é no sistema.

// -----------------------------------------------------------------------------
// Configuração de CRM por negócio (passo 5)
// -----------------------------------------------------------------------------

// Espelha os defaults de `BusinessCrmSettings` no schema Prisma. Duplicado de
// propósito: o GET responde ANTES de a linha existir (o negócio nunca abriu a
// tela), e responder 404 ali obrigaria o front a conhecer os defaults. Se o
// schema mudar, este objeto muda junto.
export const DEFAULT_CRM_SETTINGS = {
  loyaltyEnabled: false,
  pointsPerUnit: 1,
  pointsExpireAfterDays: null,
  customerLoginEnabled: true,
} as const;

export const POINTS_PER_UNIT_MAX = 1000;
export const POINTS_EXPIRE_DAYS_MAX = 3650; // 10 anos

export interface UpdateCrmSettingsInput {
  loyaltyEnabled?: boolean;
  pointsPerUnit?: number;
  pointsExpireAfterDays?: number | null;
  customerLoginEnabled?: boolean;
}

export function validateCrmSettingsPatch(
  input: UpdateCrmSettingsInput,
): UpdateCrmSettingsInput {
  const patch: UpdateCrmSettingsInput = {};

  if (input.loyaltyEnabled !== undefined) {
    if (typeof input.loyaltyEnabled !== "boolean") {
      throw new InvalidCustomerError("loyaltyEnabled precisa ser booleano");
    }
    patch.loyaltyEnabled = input.loyaltyEnabled;
  }

  if (input.customerLoginEnabled !== undefined) {
    if (typeof input.customerLoginEnabled !== "boolean") {
      throw new InvalidCustomerError("customerLoginEnabled precisa ser booleano");
    }
    patch.customerLoginEnabled = input.customerLoginEnabled;
  }

  if (input.pointsPerUnit !== undefined) {
    if (!Number.isInteger(input.pointsPerUnit) || input.pointsPerUnit < 1) {
      throw new InvalidCustomerError("pointsPerUnit precisa ser inteiro positivo");
    }
    if (input.pointsPerUnit > POINTS_PER_UNIT_MAX) {
      throw new InvalidCustomerError("pointsPerUnit é alto demais");
    }
    patch.pointsPerUnit = input.pointsPerUnit;
  }

  if (input.pointsExpireAfterDays !== undefined) {
    // null é o valor com significado: ponto que não expira. Não é ausência.
    if (input.pointsExpireAfterDays !== null) {
      if (!Number.isInteger(input.pointsExpireAfterDays) || input.pointsExpireAfterDays < 1) {
        throw new InvalidCustomerError("pointsExpireAfterDays precisa ser inteiro positivo ou nulo");
      }
      if (input.pointsExpireAfterDays > POINTS_EXPIRE_DAYS_MAX) {
        throw new InvalidCustomerError("pointsExpireAfterDays é alto demais");
      }
    }
    patch.pointsExpireAfterDays = input.pointsExpireAfterDays;
  }

  if (Object.keys(patch).length === 0) {
    throw new InvalidCustomerError("Nada para atualizar");
  }

  return patch;
}

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class InvalidTagError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// Cor é só apresentação; o hex é a forma mais portável de garanti-la
// consistente entre React (que aceita qualquer string CSS) e qualquer
// exportação futura (CSV, impressão). Nome tem limite para não virar campo
// livre disfarçado de etiqueta.
export function validateTagInput(name: string, color: string | null): { name: string; color: string | null } {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new InvalidTagError("Tag name is required");
  if (trimmed.length > 32) throw new InvalidTagError("Tag name is too long");
  if (color !== null) {
    if (!HEX_COLOR.test(color)) throw new InvalidTagError("Tag color must be a hex value like #1a2b3c");
  }
  return { name: trimmed, color };
}

// -----------------------------------------------------------------------------
// Loyalty ADJUST
// -----------------------------------------------------------------------------

export const ADJUST_REASON_MIN = 3;
export const ADJUST_REASON_MAX = 200;

export interface AdjustLoyaltyInput {
  points: number;
  reason: string;
  // Chave opcional para idempotência — o atendente pode dar duplo-clique em
  // conexão ruim, e isso é a única defesa do lado do cliente.
  idempotencyKey?: string;
}

// §2.3: ADJUST é o único caminho manual e é a única coisa do livro-razão que
// aceita pontos de qualquer sinal. Tudo o que entra como EARN/REDEEM é
// decidido em outra camada (futura, no ciclo de vida da reserva).
export function validateLoyaltyAdjust(input: AdjustLoyaltyInput): {
  points: number;
  reason: string;
  idempotencyKey: string | null;
} {
  if (!Number.isInteger(input.points) || input.points === 0) {
    throw new InvalidTagError("Points must be a non-zero integer");
  }

  const trimmed = input.reason.trim();
  if (trimmed.length < ADJUST_REASON_MIN) {
    throw new InvalidTagError("Reason is required");
  }
  if (trimmed.length > ADJUST_REASON_MAX) {
    throw new InvalidTagError("Reason is too long");
  }

  // idempotencyKey do Prisma é único por negócio. Limite de tamanho por defesa:
  // um cliente malicioso empurrando 1 MB de string no header não pode inflar
  // o índice.
  let key: string | null = null;
  if (input.idempotencyKey !== undefined && input.idempotencyKey.length > 0) {
    if (input.idempotencyKey.length > 200) {
      throw new InvalidTagError("Idempotency key is too long");
    }
    key = input.idempotencyKey;
  }

  return { points: input.points, reason: trimmed, idempotencyKey: key };
}

// ADJUST e os outros tipos não compartilham endpoint por motivo: EARN/REDEEM
// são disparados pelo ciclo de vida da reserva (fase 5/6), não pela equipe.
// Mantê-los no enum só para reservar o shape.
export const LOYALTY_MANUAL_KINDS: LoyaltyEntryKind[] = [LoyaltyEntryKind.ADJUST];

export function isManualLoyaltyKind(kind: LoyaltyEntryKind): boolean {
  return LOYALTY_MANUAL_KINDS.includes(kind);
}

// -----------------------------------------------------------------------------
// Cursor do histórico de reservas
// -----------------------------------------------------------------------------

// Cursor do keyset de reservas: (createdAt DESC, id DESC). Mesma ideia do cursor
// de prontuários, mais simples porque a chave é só a tupla (createdAt, id) —
// sem desempate de nome. O repo lê direto deste formato, então decodificar
// malicioso precisa falhar em formato, não em conteúdo.
export interface BookingCursor {
  createdAt: Date;
  id: number;
}

const BOOKING_CURSOR_PREFIX = "b1:"; // versão 1

export function encodeBookingCursor(cursor: BookingCursor): string {
  const payload = `${BOOKING_CURSOR_PREFIX}${cursor.createdAt.getTime()}|${cursor.id}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeBookingCursor(raw: string | null | undefined): BookingCursor | null {
  if (raw === null || raw === undefined || raw === "") return null;

  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw new InvalidCursorError();
  }

  const match = /^b1:(-?\d+)\|(-?\d+)$/s.exec(decoded);
  if (!match) throw new InvalidCursorError();

  const timestamp = Number(match[1]);
  const id = Number(match[2]);
  if (!Number.isFinite(timestamp) || !Number.isFinite(id)) throw new InvalidCursorError();
  if (!Number.isInteger(id) || id < 0) throw new InvalidCursorError();

  return { createdAt: new Date(timestamp), id };
}
