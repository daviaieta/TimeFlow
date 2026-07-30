"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { TeamAvatar } from "@/components/team-avatar";
import { formatMinutes } from "@/lib/schedule";
import {
  PublicEmployee,
  PublicService,
  formatPrice,
  nextSlotLabel,
} from "@/lib/publicBooking";
import { EYEBROW, FOCUS, WizardShell } from "./wizard-shell";

interface EmployeePickerProps {
  businessName: string;
  initials: string;
  service: PublicService;
  selected: PublicEmployee | null;
  todayKey: string;
  onSelect: (employee: PublicEmployee) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function EmployeePicker({
  businessName,
  initials,
  service,
  selected,
  todayKey,
  onSelect,
  onBack,
  onContinue,
}: EmployeePickerProps) {
  const action = (
    <Button
      size="lg"
      className="h-12 w-full rounded-2xl text-[15px]"
      disabled={!selected}
      onClick={onContinue}
    >
      Continuar
      <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
    </Button>
  );

  return (
    <WizardShell
      step={2}
      title="Com quem?"
      subtitle={`${service.name} · ${formatMinutes(service.duration)}`}
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

          <dl className="mt-8 flex items-baseline justify-between gap-4 text-sm">
            <dt className="text-muted-foreground">Profissional</dt>
            <dd
              className={selected ? "truncate font-medium" : "text-muted-foreground"}
            >
              {selected ? selected.name : "A escolher"}
            </dd>
          </dl>
        </div>
      }
      mobileSummary={
        <div className="flex items-baseline justify-between gap-4">
          <p
            className={`truncate text-sm ${
              selected ? "font-medium" : "text-muted-foreground"
            }`}
          >
            {selected ? selected.name : "Selecione um profissional"}
          </p>
          <p className="shrink-0 text-sm text-muted-foreground">
            {formatPrice(service.price)}
          </p>
        </div>
      }
    >
      <section className="mt-10 lg:mt-14">
        <h2 className={`${EYEBROW} text-muted-foreground`}>Profissionais</h2>

        <div className="mt-4 flex flex-col gap-1 lg:max-w-3xl">
          {service.employees.map((employee) => {
            const active = selected?.id === employee.id;

            return (
              <button
                key={employee.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(employee)}
                className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors duration-200 active:scale-[0.99] sm:gap-5 sm:px-5 ${FOCUS} ${
                  active ? "bg-accent" : "hover:bg-muted/60"
                }`}
              >
                <TeamAvatar
                  name={employee.name}
                  src={employee.avatarUrl}
                  className="size-10 rounded-xl"
                />

                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[18px] font-semibold leading-snug tracking-[-0.015em] lg:text-[21px] ${
                      active ? "text-accent-foreground" : ""
                    }`}
                  >
                    {employee.name}
                  </span>
                  <span
                    className={`mt-1 block truncate text-[13px] ${
                      active ? "text-accent-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {employee.nextSlot
                      ? `Livre ${nextSlotLabel(employee.nextSlot, todayKey).toLowerCase()}`
                      : "Sem horários para este serviço"}
                  </span>
                </span>

                {/* Ocupa espaço sempre para a linha não pular ao selecionar. */}
                <span
                  aria-hidden
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full transition-all duration-200 motion-reduce:transition-none ${
                    active
                      ? "scale-100 bg-primary text-primary-foreground opacity-100"
                      : "scale-75 opacity-0"
                  }`}
                >
                  <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </WizardShell>
  );
}
