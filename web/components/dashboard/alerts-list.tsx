import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Mail01Icon,
  Scissor01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { AlertKind, DashboardAlert } from "@/lib/dashboard";

// Cada alerta aponta para a tela onde ele se resolve: ler o problema sem ter
// para onde ir é o que faz um painel de avisos virar ruído.
const destinations: Record<
  AlertKind,
  { icon: typeof Alert01Icon; href: string; action: string }
> = {
  "employee-no-slots": {
    icon: Calendar03Icon,
    href: "/dashboard/schedule",
    action: "Abrir agenda",
  },
  "service-no-employee": {
    icon: Scissor01Icon,
    href: "/dashboard/services",
    action: "Ver serviços",
  },
  "day-fully-booked": {
    icon: UserGroupIcon,
    href: "/dashboard/schedule",
    action: "Abrir agenda",
  },
  "pending-invite": {
    icon: Mail01Icon,
    href: "/dashboard/team",
    action: "Ver equipe",
  },
};

export function AlertsList({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="size-6 text-emerald-600 dark:text-emerald-400"
        />
        <p className="text-sm font-medium">Nada pendente</p>
        <p className="text-xs text-muted-foreground">
          Equipe, serviços e agenda estão em dia.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {alerts.map((alert) => {
        const destination = destinations[alert.kind];

        return (
          <li key={alert.kind} className="flex items-start gap-3">
            <HugeiconsIcon
              icon={destination.icon}
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <div className="min-w-0">
              <p className="text-sm">{alert.label}</p>
              <Link
                href={destination.href}
                className="text-xs font-medium text-primary hover:underline"
              >
                {destination.action}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
