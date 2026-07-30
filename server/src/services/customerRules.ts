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
