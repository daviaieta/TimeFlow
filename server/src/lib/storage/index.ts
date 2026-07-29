import { env } from "../../config/env";
import { createDiskStorage } from "./diskStorage";
import { createR2Storage } from "./r2Storage";
import { ObjectStorage } from "./types";

let instance: ObjectStorage | null = null;

// Preguiçoso: o cliente do S3 só nasce no primeiro upload. A validação da
// configuração, essa sim, já rodou no boot (config/env.ts).
export function getStorage(): ObjectStorage {
  if (!instance) {
    instance =
      env.storage.mode === "r2" ? createR2Storage(env.storage) : createDiskStorage(env.storage);
  }

  return instance;
}

export * from "./types";
