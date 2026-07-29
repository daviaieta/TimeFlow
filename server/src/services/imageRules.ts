import { BadRequestError } from "../lib/errors";

export type ImageKind = "jpeg" | "png" | "webp";
export type ImageSlot = "logo" | "banner" | "avatar";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<ImageKind, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Assinatura do arquivo, nunca o Content-Type: o header é escrito pelo cliente
// e um executável renomeado chega dizendo ser image/png.
export function detectImageKind(bytes: Buffer): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }

  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }

  // RIFF também abre WAV e AVI — o "WEBP" no byte 8 é o que separa.
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

export function validateImageUpload(bytes: Buffer): ImageKind {
  if (bytes.length === 0) {
    throw new BadRequestError("Envie um arquivo de imagem.");
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new BadRequestError("A imagem precisa ter no máximo 2 MB.");
  }

  const kind = detectImageKind(bytes);
  if (!kind) {
    throw new BadRequestError("Formato não suportado. Envie JPG, PNG ou WebP.");
  }

  return kind;
}

// O sufixo aleatório faz duas coisas: impede adivinhar a imagem de outro
// negócio pela URL e garante que a troca não seja servida do cache com a
// foto antiga.
export function buildImageKey(input: {
  slot: ImageSlot;
  ownerId: number;
  kind: ImageKind;
  random: string;
}): string {
  const folder = input.slot === "avatar" ? "employees" : "businesses";
  return `${folder}/${input.ownerId}/${input.slot}-${input.random}.${EXTENSIONS[input.kind]}`;
}
