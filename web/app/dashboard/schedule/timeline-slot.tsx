"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import type { TimelineFree } from "@/lib/timeline";
import { RAIL, TIME_CELL } from "./timeline";

interface TimelineSlotRowProps {
  item: TimelineFree;
  selected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onBook: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Horário livre ocupa uma linha e nada mais. As ações só aparecem quando o
// barbeiro demonstra interesse — passando o mouse, tocando na linha ou
// chegando nela pelo teclado —, senão a agenda vira um paredão de botões.
export function TimelineSlotRow({
  item,
  selected,
  canManage,
  onSelect,
  onBook,
  onEdit,
  onDelete,
}: TimelineSlotRowProps) {
  if (item.past) {
    return (
      <div className={RAIL}>
        <div className={`${TIME_CELL} pt-2.5 opacity-50`}>{item.startTime}</div>
        <div className="py-2 pl-4 text-sm text-muted-foreground/45">Vago</div>
      </div>
    );
  }

  return (
    <div
      className={`${RAIL} group`}
      data-selected={selected || undefined}
      onClick={onSelect}
    >
      <div className={`${TIME_CELL} pt-2.5`}>{item.startTime}</div>
      <div className="flex min-h-10 items-center justify-between gap-2 rounded-r-lg py-1.5 pl-4 transition-colors group-hover:bg-muted/50 group-data-[selected]:bg-muted/50">
        <span className="text-sm text-muted-foreground/60">Disponível</span>

        {/* pointer-events-none enquanto invisível: sem isso, um toque na linha
            no celular acertaria o botão escondido em vez de revelá-lo. Foco
            por teclado continua funcionando. */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-data-[selected]:pointer-events-auto group-data-[selected]:opacity-100 motion-reduce:transition-none">
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Editar horário das ${item.startTime}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
              >
                <HugeiconsIcon icon={PencilEdit02Icon} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir horário das ${item.startTime}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onBook();
            }}
          >
            Reservar
          </Button>
        </div>
      </div>
    </div>
  );
}
