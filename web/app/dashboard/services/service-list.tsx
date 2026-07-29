import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeamAvatar } from "@/components/team-avatar";
import { formatMinutes } from "@/lib/schedule";
import { Service } from "@/lib/types";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

// Serviço sem ninguém vinculado não aparece na página pública e não pode ser
// reservado. O dashboard já alerta sobre isso; aqui, que é onde se resolve, o
// aviso leva direto para a tela da equipe.
function Team({ service }: { service: Service }) {
  if (service.employees.length === 0) {
    return (
      <Link
        href="/dashboard/team"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
      >
        <HugeiconsIcon icon={Alert01Icon} className="size-3.5 shrink-0" />
        Sem profissional
      </Link>
    );
  }

  return (
    // O -space-x sobrepõe os avatares; o ring devolve o contorno de cada um,
    // senão a pilha vira uma mancha só.
    <div className="flex -space-x-2">
      {service.employees.map((employee) => (
        <TeamAvatar
          key={employee.id}
          name={employee.name}
          className="size-7 rounded-full text-[10px] ring-2 ring-card"
        />
      ))}
    </div>
  );
}

function Actions({
  service,
  onEdit,
  onDelete,
}: {
  service: Service;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Editar ${service.name}`}
        onClick={() => onEdit(service)}
      >
        <HugeiconsIcon icon={PencilEdit02Icon} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Excluir ${service.name}`}
        onClick={() => onDelete(service)}
      >
        <HugeiconsIcon icon={Delete02Icon} />
      </Button>
    </div>
  );
}

export function ServiceList({
  services,
  isAdmin,
  onEdit,
  onDelete,
}: {
  services: Service[];
  isAdmin: boolean;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
}) {
  return (
    <>
      {/* Abaixo de sm a tabela rolaria na horizontal — mesmo tratamento da
          BusinessTable: cada serviço vira uma linha empilhada. */}
      <div className="flex flex-col divide-y sm:hidden">
        {services.map((service) => (
          <div key={service.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{service.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                  {formatMinutes(service.duration)}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">
                {currency.format(Number(service.price))}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Team service={service} />
              {isAdmin ? (
                <Actions service={service} onEdit={onEdit} onDelete={onDelete} />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Quem executa</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              {isAdmin ? <TableHead className="w-24" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell>
                  <Team service={service} />
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatMinutes(service.duration)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(Number(service.price))}
                </TableCell>
                {isAdmin ? (
                  <TableCell>
                    <Actions service={service} onEdit={onEdit} onDelete={onDelete} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
