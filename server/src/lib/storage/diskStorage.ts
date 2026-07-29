import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ObjectStorage } from "./types";

function resolveInside(rootDir: string, key: string): string {
  const target = path.resolve(rootDir, key);
  const root = path.resolve(rootDir);

  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Caminho inválido para o storage");
  }

  return target;
}

// Usado só em desenvolvimento: o disco do container em produção é apagado a
// cada deploy. A escolha entre isto e o R2 está em storageConfig.
export function createDiskStorage(config: {
  rootDir: string;
  baseUrl: string;
}): ObjectStorage {
  return {
    async put(key, body) {
      const target = resolveInside(config.rootDir, key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    },

    async delete(key) {
      await rm(resolveInside(config.rootDir, key), { force: true });
    },

    publicUrl(key) {
      return `${config.baseUrl}/uploads/${key}`;
    },
  };
}
