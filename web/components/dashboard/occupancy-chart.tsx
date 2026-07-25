import { OccupancyBucket, formatPercent } from "@/lib/dashboard";

export function OccupancyChart({ buckets }: { buckets: OccupancyBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.booked + b.free));
  const totalBooked = buckets.reduce((sum, b) => sum + b.booked, 0);
  const totalSlots = buckets.reduce((sum, b) => sum + b.booked + b.free, 0);

  if (totalSlots === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhum horário aberto neste período.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
          {formatPercent(totalBooked / totalSlots)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          ocupado · {totalBooked} de {totalSlots} horários
        </span>
      </div>

      {/* A linha de fora fica em `align-items` padrão (stretch) para que cada
          coluna herde uma altura definida do h-44 — sem isso, a barra em
          `height: X%` não tem base para resolver o percentual e desaparece.
          `justify-end` empurra barra+rótulo para o rodapé da coluna, repondo
          visualmente o mesmo ancoramento que `items-end` daria na linha. */}
      <div className="mt-6 flex h-44 gap-2">
        {buckets.map((bucket) => {
          const total = bucket.booked + bucket.free;
          const height = (total / max) * 100;
          const bookedShare = total === 0 ? 0 : (bucket.booked / total) * 100;

          return (
            <div
              key={bucket.key}
              className="group flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-t-md border border-border/70 bg-muted/50 transition-colors group-hover:border-border"
                style={{ height: `${Math.max(height, 2)}%` }}
                // O title é a camada de detalhe: o eixo mostra a forma, o hover
                // mostra o número exato sem poluir a barra.
                title={`${bucket.label}: ${bucket.booked} ocupados de ${total}`}
              >
                <div
                  className="w-full bg-primary transition-[height] duration-500"
                  style={{ height: `${bookedShare}%` }}
                />
              </div>
              <span className="mt-2 w-full truncate text-center text-[11px] text-muted-foreground tabular-nums">
                {bucket.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Ocupado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-border/70 bg-muted/50" />{" "}
          Livre
        </span>
      </div>
    </div>
  );
}
