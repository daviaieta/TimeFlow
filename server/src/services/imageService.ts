import { randomBytes } from "node:crypto";
import { CONTENT_TYPES, getStorage } from "../lib/storage";
import { ImageSlot, buildImageKey, validateImageUpload } from "./imageRules";

export const imageService = {
  async storeImage(input: {
    slot: ImageSlot;
    ownerId: number;
    bytes: Buffer;
  }): Promise<string> {
    const kind = validateImageUpload(input.bytes);
    const key = buildImageKey({
      slot: input.slot,
      ownerId: input.ownerId,
      kind,
      random: randomBytes(8).toString("hex"),
    });

    await getStorage().put(key, input.bytes, CONTENT_TYPES[kind]);

    return key;
  },

  // Best-effort: objeto órfão no bucket custa centavos, derrubar a troca de
  // foto por causa dele custa a confiança de quem clicou.
  async discardImage(key: string | null): Promise<void> {
    if (!key) return;

    try {
      await getStorage().delete(key);
    } catch (error) {
      console.error(`Falha ao apagar o objeto ${key}:`, error);
    }
  },

  imageUrl(key: string | null): string | null {
    return key ? getStorage().publicUrl(key) : null;
  },
};
