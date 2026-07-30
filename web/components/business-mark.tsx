import { businessGradient } from "@/lib/showcase";
import { businessInitials, formatBusinessName } from "@/lib/businessName";
import { cn } from "@/lib/utils";

interface BusinessMarkProps {
  name: string;
  slug: string;
  /** URL pública da imagem; sem ela, cai nas iniciais. */
  src?: string | null;
  className?: string;
}

export function BusinessMark({ name, slug, src, className }: BusinessMarkProps) {
  if (src) {
    return (
      // A logo do negócio vem de URL externa cadastrada pelo dono; next/image
      // exigiria configurar cada domínio permitido antecipadamente.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={formatBusinessName(name)}
        className={cn("size-16 rounded-3xl object-cover", className)}
      />
    );
  }

  const { from, to } = businessGradient(slug);

  return (
    <span
      aria-hidden
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
      className={cn(
        "flex size-16 items-center justify-center rounded-3xl text-xl font-semibold text-white shadow-lg ring-1 ring-white/15",
        className,
      )}
    >
      {businessInitials(name)}
    </span>
  );
}
