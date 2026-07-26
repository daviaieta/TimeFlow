"use client";

import { FormEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatMinutes } from "@/lib/schedule";
import {
  PublicEmployee,
  PublicService,
  PublicSlot,
  dayChipLabel,
  formatPrice,
  serviceWindow,
} from "@/lib/publicBooking";
import { EYEBROW, WizardShell } from "./wizard-shell";

// O botão vive no painel lateral e na barra do mobile, fora do <form>.
const FORM_ID = "booking-details";

interface DetailsFormProps {
  businessName: string;
  initials: string;
  service: PublicService;
  employee: PublicEmployee;
  showEmployee: boolean;
  day: string;
  slot: PublicSlot;
  todayKey: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  error: string | null;
  submitting: boolean;
  onChangeName: (value: string) => void;
  onChangePhone: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const INPUT = "h-12 rounded-2xl px-4 text-[15px]";

export function DetailsForm({
  businessName,
  initials,
  service,
  employee,
  showEmployee,
  day,
  slot,
  todayKey,
  clientName,
  clientPhone,
  clientEmail,
  error,
  submitting,
  onChangeName,
  onChangePhone,
  onChangeEmail,
  onBack,
  onSubmit,
}: DetailsFormProps) {
  const action = (
    <Button
      type="submit"
      form={FORM_ID}
      size="lg"
      className="h-12 w-full rounded-2xl text-[15px]"
      disabled={submitting}
    >
      {submitting ? (
        <>
          <Spinner data-icon="inline-start" />
          Confirmando…
        </>
      ) : (
        <>
          Confirmar agendamento
          <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
        </>
      )}
    </Button>
  );

  return (
    <WizardShell
      step={4}
      title="Seus dados"
      subtitle="Só para confirmar o horário e avisar você — sem criar conta."
      businessName={businessName}
      initials={initials}
      onBack={onBack}
      action={action}
      summary={
        <div className="mt-7 border-t pt-8">
          <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.015em]">
            {service.name}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {formatMinutes(service.duration)} · {formatPrice(service.price)}
          </p>

          <dl className="mt-8 flex flex-col gap-4 text-sm">
            {showEmployee && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Profissional</dt>
                <dd className="truncate font-medium">{employee.name}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Data</dt>
              <dd className="font-medium">{dayChipLabel(day, todayKey)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Horário</dt>
              <dd className="font-medium tabular-nums">
                {serviceWindow(slot.startTime, service.duration)}
              </dd>
            </div>
          </dl>
        </div>
      }
      mobileSummary={
        <div className="flex items-baseline justify-between gap-4">
          <p className="truncate text-sm font-medium tabular-nums">
            {dayChipLabel(day, todayKey)} ·{" "}
            {serviceWindow(slot.startTime, service.duration)}
          </p>
          <p className="shrink-0 text-sm text-muted-foreground">
            {formatPrice(service.price)}
          </p>
        </div>
      }
    >
      <section className="mt-10 lg:mt-14">
        <h2 className={`${EYEBROW} text-muted-foreground`}>Contato</h2>

        <form
          id={FORM_ID}
          onSubmit={onSubmit}
          className="mt-6 flex max-w-md flex-col gap-6"
        >
          <Field>
            <FieldLabel htmlFor="client-name" className="text-sm font-medium">
              Nome
            </FieldLabel>
            <Input
              id="client-name"
              className={INPUT}
              value={clientName}
              onChange={(event) => onChangeName(event.target.value)}
              placeholder="Como devemos te chamar?"
              autoComplete="name"
              maxLength={80}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="client-phone" className="text-sm font-medium">
              WhatsApp
            </FieldLabel>
            <Input
              id="client-phone"
              type="tel"
              className={INPUT}
              value={clientPhone}
              onChange={(event) => onChangePhone(event.target.value)}
              placeholder="(11) 99999-0000"
              autoComplete="tel"
              maxLength={20}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="client-email" className="text-sm font-medium">
              E-mail{" "}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </FieldLabel>
            <Input
              id="client-email"
              type="email"
              className={INPUT}
              value={clientEmail}
              onChange={(event) => onChangeEmail(event.target.value)}
              placeholder="voce@email.com"
              autoComplete="email"
              maxLength={120}
            />
          </Field>

          {error && <FieldError>{error}</FieldError>}
        </form>
      </section>
    </WizardShell>
  );
}
