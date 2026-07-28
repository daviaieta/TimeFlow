"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContactMessage, ContactStatus } from "@/lib/types";
import { useAuthUser } from "../auth-context";

const statusLabels: Record<ContactStatus, string> = {
  NEW: "Nova",
  READ: "Lida",
  ARCHIVED: "Arquivada",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ContatosPage() {
  const user = useAuthUser();
  const isSuperadmin = user.role === "SUPERADMIN";

  const [messages, setMessages] = useState<ContactMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Devolve uma promise que nunca rejeita: erros de rede viram estado local,
  // para que `await load()` dentro da transition sempre resolva e o
  // `isPending` volte a false mesmo quando o fetch falha.
  const load = useCallback(() => {
    return fetchAdapter<{ messages: ContactMessage[] }>({
      method: "GET",
      path: "/contact-messages",
    })
      .then(({ data }) => {
        setMessages(data.messages);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, []);

  // O fetch roda dentro de uma transition (em vez de um setState síncrono no
  // corpo do efeito) para não disparar o lint `react-hooks/set-state-in-effect`
  // e para que `isPending` sirva como indicador de carregamento.
  useEffect(() => {
    if (!isSuperadmin) return;
    startTransition(async () => {
      await load();
    });
  }, [isSuperadmin, load]);

  function changeStatus(id: number, status: ContactStatus) {
    startTransition(async () => {
      // Recarrega só depois de a mutação dar certo: se o PATCH falhar, o
      // catch define o erro e a recarga é pulada, senão o `load()` bem-
      // sucedido apaga a mensagem de erro que acabamos de definir.
      try {
        await fetchAdapter({
          method: "PATCH",
          path: `/contact-messages/${id}`,
          body: { status },
        });
        await load();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      }
    });
  }

  // A guarda de verdade é no servidor (authorize SUPERADMIN); esta é só para
  // não mostrar uma tela vazia e um erro 403 a quem errou a URL.
  if (!isSuperadmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta página é exclusiva do administrador da plataforma.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contatos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mensagens enviadas pelo formulário da landing page.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium">{error}</span>{" "}
          <button
            className="underline text-muted-foreground hover:text-foreground"
            onClick={() => load()}
            type="button"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {messages === null && !error && (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      )}

      {messages?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma mensagem ainda. Quando alguém escrever pela página de contato,
          ela aparece aqui.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {messages?.map((message) => (
          <li
            key={message.id}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{message.name}</p>
                <p className="text-xs text-muted-foreground">
                  {message.email}
                  {message.phone ? ` · ${message.phone}` : ""}
                  {message.businessName ? ` · ${message.businessName}` : ""}
                  {message.teamSize ? ` · ${message.teamSize}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={message.status === "NEW" ? "default" : "secondary"}>
                  {statusLabels[message.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {dateFormatter.format(new Date(message.createdAt))}
                </span>
              </div>
            </div>

            <p className="mt-4 text-sm whitespace-pre-wrap">{message.message}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {/* Button não suporta `asChild`: aplicamos as classes do botão
                  diretamente num <a>, para o link abrir o cliente de e-mail
                  em vez de disparar navegação do Next. */}
              <a
                className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                href={`mailto:${message.email}`}
              >
                Responder por e-mail
              </a>
              {message.status !== "READ" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => changeStatus(message.id, "READ")}
                >
                  Marcar como lida
                </Button>
              )}
              {message.status !== "ARCHIVED" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => changeStatus(message.id, "ARCHIVED")}
                >
                  Arquivar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
