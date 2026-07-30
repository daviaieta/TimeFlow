export type StorageConfig =
  | { mode: "disk"; rootDir: string; baseUrl: string }
  | {
      mode: "r2";
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
      publicUrl: string;
    };

const R2_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const;

function filled(source: NodeJS.ProcessEnv, name: string): boolean {
  return (source[name] ?? "").trim() !== "";
}

// Tudo ou nada. Meia configuração em produção gravaria no disco do container
// do Railway, que é apagado a cada deploy: as fotos sumiriam sem um único
// erro no log.
export function resolveStorageConfig(
  source: NodeJS.ProcessEnv,
  fallback: { rootDir: string; baseUrl: string },
): StorageConfig {
  const present = R2_VARS.filter((name) => filled(source, name));

  if (present.length === 0) {
    return { mode: "disk", rootDir: fallback.rootDir, baseUrl: fallback.baseUrl };
  }

  if (present.length < R2_VARS.length) {
    const missing = R2_VARS.filter((name) => !filled(source, name));
    throw new Error(
      `Configuração do Cloudflare R2 incompleta: faltam ${missing.join(", ")}. ` +
        "Defina todas as variáveis ou nenhuma (nenhuma = armazenamento em disco, só para desenvolvimento).",
    );
  }

  return {
    mode: "r2",
    accountId: source.R2_ACCOUNT_ID!.trim(),
    accessKeyId: source.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: source.R2_SECRET_ACCESS_KEY!.trim(),
    bucket: source.R2_BUCKET!.trim(),
    // Sem a barra final: quem monta a URL sempre concatena "/" + key.
    publicUrl: source.R2_PUBLIC_URL!.trim().replace(/\/+$/, ""),
  };
}

// resolveStorageConfig sozinho deixa passar batido o caso "zero variáveis do
// R2 em produção": ele é indistinguível de desenvolvimento e cai em disco em
// silêncio. Em produção isso apaga as fotos a cada deploy do Railway (disco
// efêmero) sem nenhum erro — os *Key sobrevivem no Postgres apontando para
// nada. Ruling: derrubar o boot é melhor que perder dado calado.
export function assertStorageReadyForProduction(nodeEnv: string, storage: StorageConfig): void {
  if (nodeEnv !== "production" || storage.mode !== "disk") return;

  throw new Error(
    "Armazenamento em disco não é permitido em produção: o disco do container é " +
      `apagado a cada deploy e as fotos seriam perdidas sem aviso. Defina as ` +
      `variáveis do Cloudflare R2: ${R2_VARS.join(", ")}.`,
  );
}
