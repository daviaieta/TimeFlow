import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building03Icon,
  MailOpen01Icon,
  UserGroupIcon,
  UserShield01Icon,
} from "@hugeicons/core-free-icons";
import { PlatformTotals } from "@/lib/platform";
import { cn } from "@/lib/utils";

function Tile({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: typeof Building03Icon;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-sm",
        highlight && "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <HugeiconsIcon
          icon={icon}
          className={cn(
            "size-4 text-muted-foreground/60",
            highlight && "text-amber-600 dark:text-amber-500",
          )}
        />
      </div>
      <p
        className={cn(
          "mt-3 text-3xl leading-none font-semibold tracking-tight tabular-nums",
          highlight && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function PlatformTiles({ totals }: { totals: PlatformTotals }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile label="Negócios" value={totals.businesses} icon={Building03Icon} />
      <Tile label="Colaboradores" value={totals.employees} icon={UserGroupIcon} />
      <Tile label="Administradores" value={totals.admins} icon={UserShield01Icon} />
      {/* Único número acionável da tela: destaca quando há o que destravar. */}
      <Tile
        label="Convites pendentes"
        value={totals.pendingInvites}
        icon={MailOpen01Icon}
        highlight={totals.pendingInvites > 0}
      />
    </div>
  );
}
