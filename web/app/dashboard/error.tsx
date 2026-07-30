"use client";

import { useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";

// Sem este arquivo, qualquer exceção de render numa tela do painel sobe até o
// global-error do Next e substitui a página inteira por "This page couldn't
// load", em inglês e sem sidebar — foi o que o usuário viu quando a API em
// produção ficou uma versão atrás e devolveu um campo a menos. Aqui a falha
// fica contida no <main>: a navegação continua de pé e dá para ir para outra
// tela sem recarregar.
//
// Fica em /dashboard e não em cada tela porque o error.tsx de um segmento não
// envolve o layout do próprio segmento: a sidebar e o header sobrevivem.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Único registro que existe hoje: sem isto o erro real morre no boundary e
    // fica só a mensagem genérica na tela.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-muted">
        <HugeiconsIcon icon={Alert01Icon} className="size-5 text-muted-foreground" />
      </span>
      <p className="mt-4 text-sm font-medium">Algo deu errado nesta tela</p>
      <p className="mt-1 text-sm text-muted-foreground">
        O erro foi só aqui — o resto do painel continua funcionando. Tente de
        novo; se insistir, recarregue a página.
      </p>
      {/* O digest é o que liga a tela ao log do servidor. Em produção a
          mensagem original não vem para o cliente, então sem ele não há como
          casar o relato do usuário com o erro registrado. */}
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Código: {error.digest}
        </p>
      ) : null}
      <Button className="mt-5" onClick={() => reset()}>
        Tentar de novo
      </Button>
    </div>
  );
}
