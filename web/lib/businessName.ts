// Só reformata quando o nome parece slug (tudo minúsculo com separador).
// Assim "old-brothers" vira "Old Brothers", mas uma marca propositalmente
// minúscula ou um nome já escrito por humano passa intacto.
const SLUG_LIKE = /^[a-z0-9]+([-_][a-z0-9]+)+$/;

export function formatBusinessName(name: string): string {
  const trimmed = name.trim();
  if (!SLUG_LIKE.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function businessInitials(name: string): string {
  return formatBusinessName(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
