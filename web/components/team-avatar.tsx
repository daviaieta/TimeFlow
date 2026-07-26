import { businessInitials } from "@/lib/businessName";
import { cn } from "@/lib/utils";

interface TeamAvatarProps {
  name: string;
  /** Reservado para a Fase 2, quando o colaborador puder ter foto. */
  src?: string | null;
  className?: string;
}

export function TeamAvatar({ name, src, className }: TeamAvatarProps) {
  if (src) {
    return (
      // Mesma razão do BusinessMark: URL externa, sem domínio conhecido de
      // antemão para configurar em next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn("size-12 rounded-2xl object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-sm font-semibold text-muted-foreground",
        className,
      )}
    >
      {businessInitials(name)}
    </span>
  );
}
