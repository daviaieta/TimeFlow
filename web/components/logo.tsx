import { cn } from "@/lib/utils";

/**
 * Símbolo da marca (relógio + seta). Desenhado com `currentColor`, então herda
 * a cor do contexto — é o que faz a mesma logo servir em light, dark e sobre
 * fundo roxo sem precisar de um arquivo por variante.
 *
 * O traço é definido no espaço do viewBox (320) e o SVG escala junto, então
 * `strokeWidth` é espessura *relativa*: abaixo de ~32px o traço padrão some,
 * e por isso a marca compacta usa um valor maior.
 */
export function LogoMark({
  className,
  strokeWidth = 22,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 320 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-8", className)}
    >
      <g
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      >
        <circle cx="144" cy="160" r="76" />
        <path d="M144 112 L144 160" />
        <path d="M144 160 L250 160" />
      </g>
    </svg>
  );
}

/** Versão para 20–32px: traço reforçado, senão o relógio vira um borrão. */
export function LogoMarkCompact({ className }: { className?: string }) {
  return <LogoMark className={cn("size-6", className)} strokeWidth={30} />;
}

/**
 * Símbolo dentro do badge roxo — a única peça da marca com cor fixa, porque
 * vive sobre fundos que não controlamos (favicon, avatar, app icon).
 */
export function LogoBadge({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 320"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-8", className)}
    >
      <rect width="320" height="320" rx="80" fill="#4F39F6" />
      <g
        stroke="#FFFFFF"
        strokeWidth="16"
        strokeLinecap="round"
        fill="none"
      >
        <circle cx="144" cy="160" r="76" />
        <path d="M144 112 L144 160" />
        <path d="M144 160 L250 160" />
      </g>
    </svg>
  );
}

/**
 * Lockup horizontal: símbolo + nome. O símbolo puxa a cor de marca e o texto
 * a cor de texto do tema — mesma hierarquia do lockup original, só que viva.
 * Sobre fundo roxo/escuro, passe `className="text-white"` no pai: o
 * `text-primary` do símbolo é sobrescrito por `markClassName`.
 */
export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark className={cn("text-primary", markClassName)} />
      <span className="text-lg font-semibold tracking-tight">Time Flow</span>
    </span>
  );
}
