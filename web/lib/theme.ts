export type Theme = "light" | "dark";

/**
 * Chave única do tema no localStorage. Fica num módulo neutro (nem servidor
 * nem cliente) porque é lida dos dois lados: pelo script inline do
 * `app/layout.tsx`, que roda no servidor ao montar o HTML, e pelo
 * `ThemeProvider`, que é "use client" — e todo export de um módulo client
 * vira referência de cliente, ilegível durante o render no servidor.
 */
export const THEME_STORAGE_KEY = "theme";

export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * Primeiro segmento das rotas do produto. Tudo que não está aqui é a página
 * pública de um negócio (`/[slug]` e `/[slug]/agendar`), que fica sempre
 * clara: quem abre é o cliente final, não o dono da conta, e a vitrine do
 * negócio não pode mudar de cara conforme o celular de quem clicou no link.
 */
const THEMED_ROUTE_SEGMENTS = [
  "",
  "login",
  "dashboard",
  "contato",
  "assinatura",
  "accept-invite",
  "esqueci-senha",
  "redefinir-senha",
];

/** A rota segue o tema escolhido? Se não, é página pública: sempre clara. */
export function isThemedPath(pathname: string): boolean {
  const segment = pathname.split("/")[1] ?? "";
  return THEMED_ROUTE_SEGMENTS.includes(segment);
}

/**
 * Serializado para dentro do script inline do layout, então precisa rodar sem
 * nada do bundle: só `location` e `localStorage`. Devolve o tema já resolvido.
 */
export const THEMED_ROUTE_SEGMENTS_JSON = JSON.stringify(THEMED_ROUTE_SEGMENTS);
