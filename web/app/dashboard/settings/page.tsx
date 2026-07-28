"use client";

import { BillingCard } from "./billing-card";
import { BusinessCard } from "./business-card";
import { PasswordCard } from "./password-card";
import { ProfileCard } from "./profile-card";
import { useAuthUser, useBillingEnabled } from "../auth-context";

export default function SettingsPage() {
  const user = useAuthUser();
  const billingEnabled = useBillingEnabled();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Seus dados de acesso
        {user.role === "ADMIN" ? " e as informações do seu negócio" : ""}.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {/* key no e-mail: depois de salvar, o refresh traz um user novo e o
            cartão remonta com os valores do servidor, não com o estado antigo. */}
        <ProfileCard key={user.email} user={user} />
        <PasswordCard />
        {user.role === "ADMIN" && user.business ? (
          <>
            {/* Cobrança desligada: mostrar "Assinatura: sem assinatura ativa"
                para quem está usando de cortesia só assusta. */}
            {billingEnabled ? (
              <BillingCard
                planName={user.business.planName}
                subscriptionStatus={user.business.subscriptionStatus}
              />
            ) : null}
            <BusinessCard business={user.business} />
          </>
        ) : null}
      </div>
    </div>
  );
}
