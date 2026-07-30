// ImageUploadField é reusável e não conhece o envelope de cada endpoint
// (negócio devolve { business }, colaborador devolve { employee }). Quem usa
// o campo declara de onde vem a URL através desta união fechada — só os
// slots que existem de verdade são expressáveis.
export type ImageResponseField =
  | { entity: "business"; field: "logoUrl" }
  | { entity: "business"; field: "bannerUrl" }
  | { entity: "employee"; field: "avatarUrl" };

// Lê a resposta do upload de acordo com a promessa feita em responseField.
// Se o campo declarado não vier na resposta, isso é bug de integração — não
// deve virar silêncio nem cair de volta num campo qualquer por acidente.
export function extractResponseUrl(data: unknown, responseField: ImageResponseField): string | null {
  const envelope = data as Record<string, unknown> | null | undefined;
  const entity = envelope?.[responseField.entity] as Record<string, unknown> | undefined;
  const value = entity?.[responseField.field];

  if (value === null) return null;
  if (typeof value === "string") return value;

  throw new Error(
    "A imagem foi enviada, mas a resposta do servidor veio incompleta. Recarregue a página.",
  );
}
