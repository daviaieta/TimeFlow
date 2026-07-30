import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { ImageUploadField } from "@/components/image-upload-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TeamAvatar } from "@/components/team-avatar";
import { IMAGE_PRESETS } from "@/lib/image";
import { Employee, EmployeeServiceLink, Service } from "@/lib/types";

export function EmployeeCard({
  employee,
  services,
  isAdmin,
  linking,
  linkError,
  onLink,
  onUnlink,
  onRemove,
  onAvatarChanged,
}: {
  employee: Employee;
  services: Service[];
  isAdmin: boolean;
  /** Id do serviço cujo POST está no ar, para travar o select sem congelar a tela. */
  linking: boolean;
  linkError: string | null;
  onLink: (employee: Employee, serviceId: string) => void;
  onUnlink: (employee: Employee, service: EmployeeServiceLink) => void;
  onRemove: (employee: Employee) => void;
  /** Recarrega a lista depois de trocar a foto — o card não guarda o avatar
      em estado próprio, quem sabe o dado fresco é a página. */
  onAvatarChanged: () => void;
}) {
  const unlinked = services.filter(
    (service) => !employee.services.some((linked) => linked.id === service.id),
  );

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TeamAvatar
            name={employee.name}
            src={employee.avatarUrl}
            className="size-11 rounded-2xl"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{employee.name}</p>
              <Badge variant={employee.pendingInvite ? "outline" : "default"}>
                {employee.pendingInvite ? "Convite pendente" : "Ativo"}
              </Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {employee.email}
            </p>
          </div>
        </div>

        {isAdmin && (
          // w-full abaixo de sm: o select de largura fixa empurrava o botão de
          // remover para fora do card em tela estreita.
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {unlinked.length > 0 && (
              <Select
                value=""
                disabled={linking}
                onValueChange={(value) => {
                  if (value) onLink(employee, value);
                }}
              >
                <SelectTrigger className="w-full sm:w-44" size="sm">
                  <SelectValue placeholder="Vincular serviço" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {unlinked.map((service) => (
                      <SelectItem key={service.id} value={String(service.id)}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            {/* O spinner ocupa o lugar do botão de remover enquanto o vínculo
                sobe: sem ele, clicar no select não devolvia sinal nenhum. */}
            {linking ? (
              <span className="flex size-8 shrink-0 items-center justify-center">
                <Spinner />
              </span>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={`Remover ${employee.name}`}
                onClick={() => onRemove(employee)}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="mt-4 border-t pt-4">
          <ImageUploadField
            label="Foto"
            description="Aparece para os clientes na hora de escolher com quem agendar."
            preset={IMAGE_PRESETS.avatar}
            currentUrl={employee.avatarUrl}
            uploadPath={`/employees/${employee.id}/avatar`}
            responseField={{ entity: "employee", field: "avatarUrl" }}
            onDone={() => onAvatarChanged()}
          />
        </div>
      )}

      {linkError && <p className="mt-3 text-sm text-destructive">{linkError}</p>}

      <div className="mt-4 border-t pt-4">
        {employee.services.length === 0 ? (
          // Colaborador sem serviço nenhum não aparece na página pública: o
          // cliente não tem como escolher o que marcar com ele. É o estado que
          // mais silenciosamente quebra a reserva, então ele é dito por extenso.
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <HugeiconsIcon icon={Alert01Icon} className="size-3.5 shrink-0" />
            {services.length === 0 ? (
              <>
                Nenhum serviço cadastrado —{" "}
                <Link href="/dashboard/services" className="underline">
                  cadastre um serviço
                </Link>{" "}
                para poder vincular
              </>
            ) : (
              "Sem serviço vinculado — não pode receber reservas"
            )}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {employee.services.map((service) => (
              <Badge
                key={service.id}
                variant="secondary"
                className={isAdmin ? "gap-1 pr-1" : undefined}
              >
                {service.name}
                {isAdmin && (
                  <button
                    type="button"
                    aria-label={`Desvincular ${service.name} de ${employee.name}`}
                    onClick={() => onUnlink(employee, service)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={12} />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
