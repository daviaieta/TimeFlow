"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { businessInitials } from "@/lib/businessName";
import { formatMinutes } from "@/lib/schedule";
import {
  PublicBusiness,
  PublicService,
  earliestNextSlot,
  formatPrice,
  nextSlotLabel,
} from "@/lib/publicBooking";
import { EYEBROW, FOCUS, WizardShell } from "./wizard-shell";

interface ServicePickerProps {
  catalog: PublicBusiness;
  businessName: string;
  selected: PublicService | null;
  todayKey: string;
  onSelect: (service: PublicService) => void;
  onContinue: () => void;
}

export function ServicePicker({
  catalog,
  businessName,
  selected,
  todayKey,
  onSelect,
  onContinue,
}: ServicePickerProps) {
  const services = catalog.services;
  const selectedNext = selected ? earliestNextSlot(selected.employees) : null;

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
      step={1}
      title="O que vamos agendar?"
      subtitle="Agende em menos de um minuto, sem criar conta."
      businessName={businessName}
      initials={businessInitials(catalog.business.name)}
      action={action}
      summary={
        selected ? (
          <div className="mt-7 border-t pt-8">
            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.015em]">
              {selected.name}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {formatMinutes(selected.duration)} · {formatPrice(selected.price)}
            </p>
            {selectedNext && (
              <dl className="mt-8 flex items-baseline justify-between gap-4 text-sm">
                <dt className="text-muted-foreground">Próximo horário</dt>
                <dd className="font-medium">{nextSlotLabel(selectedNext, todayKey)}</dd>
              </dl>
            )}
          </div>
        ) : (
          <p className="mt-7 border-t pt-8 text-sm text-muted-foreground">
            Escolha um serviço para ver os horários disponíveis.
          </p>
        )
      }
      mobileSummary={
        services.length > 0 ? (
          <div className="flex items-baseline justify-between gap-4">
            <p
              className={`truncate text-sm ${
                selected ? "font-medium" : "text-muted-foreground"
              }`}
            >
              {selected ? selected.name : "Selecione um serviço"}
            </p>
            {selected && (
              <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {formatMinutes(selected.duration)} · {formatPrice(selected.price)}
              </p>
            )}
          </div>
        ) : undefined
      }
    >
      {services.length === 0 ? (
        <div className="mt-12 max-w-md">
          <p className="text-[17px] font-medium">Nenhum serviço disponível</p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {businessName} ainda não abriu serviços para agendamento online.
          </p>
        </div>
      ) : (
        <section className="mt-10 lg:mt-14">
          <h2 className={`${EYEBROW} text-muted-foreground`}>Serviços</h2>

          <div className="mt-4 flex flex-col gap-1 lg:max-w-3xl">
            {services.map((service) => {
              const active = selected?.id === service.id;
              const next = earliestNextSlot(service.employees);

              return (
                <button
                  key={service.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(service)}
                  className={`flex w-full items-center gap-5 rounded-2xl px-4 py-5 text-left transition-colors duration-200 active:scale-[0.99] sm:gap-8 sm:px-5 ${FOCUS} ${
                    active ? "bg-accent" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    {/* Sem truncate: o nome é a informação principal e quebrar
                        linha custa menos que esconder. */}
                    <span
                      className={`block text-[18px] font-semibold leading-snug tracking-[-0.015em] text-balance lg:text-[21px] ${
                        active ? "text-accent-foreground" : ""
                      }`}
                    >
                      {service.name}
                    </span>
                    {next && (
                      <span
                        className={`mt-1.5 block truncate text-[13px] ${
                          active ? "text-accent-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        Livre {nextSlotLabel(next, todayKey).toLowerCase()}
                      </span>
                    )}
                  </span>

                  <span className="shrink-0 text-right">
                    <span
                      className={`block text-[16px] font-semibold tabular-nums lg:text-[17px] ${
                        active ? "text-accent-foreground" : ""
                      }`}
                    >
                      {formatPrice(service.price)}
                    </span>
                    <span
                      className={`mt-1 block text-[13px] tabular-nums ${
                        active ? "text-accent-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      {formatMinutes(service.duration)}
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
      )}
    </WizardShell>
  );
}
