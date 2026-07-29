import { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

// Lista vazia quase nunca é o fim: é o começo, e o começo precisa de um botão.
// Uma frase solta ("Nenhum serviço cadastrado ainda.") deixa o usuário
// procurando de onde sair dela.
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: typeof Add01Icon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-muted">
        <HugeiconsIcon icon={icon} className="size-5 text-muted-foreground" />
      </span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
