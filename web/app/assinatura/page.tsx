"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { AuthUser, PlanName, clearToken, getToken } from "@/lib/auth";
import { PlanGrid } from "./plan-grid";

const STATUS_MESSAGES: Record<string, string> = {
  PENDING: "Escolha um plano para liberar o painel do seu negócio.",
  PAST_DUE: "O último pagamento não foi confirmado. Reative escolhendo um plano.",
  CANCELED: "Sua assinatura foi cancelada. Escolha um plano para voltar.",
};

function SubscriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [user, setUser] = useState<AuthUser | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submittingPlan, setSubmittingPlan] = useState<PlanName | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!getToken()) {
      router.replace("/login");
      return Promise.resolve();
    }

    // SUPERADMIN não assina nada; quem já está ativo não tem o que fazer aqui.
    function finish(loadedUser: AuthUser) {
      if (
        loadedUser.role === "SUPERADMIN" ||
        loadedUser.business?.subscriptionStatus === "ACTIVE"
      ) {
        router.replace("/dashboard");
        return;
      }

      setUser(loadedUser);
    }

    return fetchAdapter<{ user: AuthUser; billingEnabled: boolean }>({
      method: "GET",
      path: "/auth/me",
    })
      .then(({ data }) => {
        // Com a cobrança desligada as rotas de checkout nem existem no
        // servidor: mostrar a grade de planos aqui só levaria a um erro no
        // clique.
        if (!data.billingEnabled) {
          router.replace("/dashboard");
          return;
        }

        // Voltando do Stripe: pergunta ao servidor (que pergunta ao Stripe) se a
        // sessão foi paga. É isto que faz o fluxo fechar sem webhook em dev.
        if (sessionId && data.user.business) {
          const businessId = data.user.business.id;
          setConfirming(true);

          return fetchAdapter<{ subscriptionStatus: string }>({
            method: "POST",
            path: `/businesses/${businessId}/checkout-session/confirm`,
            body: { sessionId },
          })
            .then(({ data: confirmed }) => {
              if (confirmed.subscriptionStatus === "ACTIVE") {
                router.replace("/dashboard");
                return;
              }

              setError(
                "O pagamento ainda não foi confirmado pelo Stripe. Se você acabou de pagar, recarregue em alguns instantes.",
              );
              finish(data.user);
            })
            .catch((err) => {
              setError(
                err instanceof ApiError ? err.message : "Não foi possível confirmar o pagamento.",
              );
              finish(data.user);
            })
            .finally(() => {
              setConfirming(false);
            });
        }

        finish(data.user);
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router, sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSelect(plan: PlanName) {
    if (!user?.business) return;

    setError(null);
    setSubmittingPlan(plan);

    try {
      const { data } = await fetchAdapter<{ checkoutUrl: string }>({
        method: "POST",
        path: `/businesses/${user.business.id}/checkout-session`,
        body: { planName: plan },
      });

      // Sai do app de propósito: o checkout é hospedado pelo Stripe.
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado. Tente de novo.");
      setSubmittingPlan(null);
    }
  }

  if (!user || confirming) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {confirming ? "Confirmando seu pagamento…" : "Carregando…"}
        </p>
      </div>
    );
  }

  const status = user.business?.subscriptionStatus ?? "PENDING";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/" className="flex items-center">
          <Logo />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clearToken();
            router.replace("/login");
          }}
        >
          Sair
        </Button>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Ative sua assinatura
          </h1>
          <p className="mt-3 text-muted-foreground">
            {STATUS_MESSAGES[status] ?? STATUS_MESSAGES.PENDING}
          </p>
        </div>

        {error ? (
          <p className="mx-auto mt-6 max-w-xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {error}
          </p>
        ) : null}

        <div className="mt-12">
          <PlanGrid submittingPlan={submittingPlan} onSelect={handleSelect} />
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Pagamento processado pelo Stripe. Seus dados de cartão não passam pelos nossos
          servidores.
        </p>
      </main>
    </div>
  );
}

export default function Page() {
  // useSearchParams exige Suspense no App Router.
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      }
    >
      <SubscriptionPage />
    </Suspense>
  );
}
