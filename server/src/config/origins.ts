const LOCAL_WEB = "http://localhost:3000";

// Produção tem mais de uma origem legítima: o domínio final e as URLs de
// preview do provedor do front. Uma origem só faria a segunda quebrar no
// preflight, com erro genérico no browser.
export function parseOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : [LOCAL_WEB];
}
