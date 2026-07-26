"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { formatMinutes } from "@/lib/schedule";
import {
  PublicEmployee,
  PublicService,
  PublicSlot,
  dayChipLabel,
  dayParts,
  formatPrice,
  groupSlotsByPeriod,
  serviceWindow,
} from "@/lib/publicBooking";
import { EYEBROW, FOCUS, WizardShell } from "./wizard-shell";

interface SlotPickerProps {
  businessName: string;
  initials: string;
  service: PublicService;
  employee: PublicEmployee;
  /** Falso quando o serviço tem um único profissional e a etapa foi pulada. */
  showEmployee: boolean;
  days: [string, PublicSlot[]][];
  day: string | null;
  slot: PublicSlot | null;
  loading: boolean;
  error: string | null;
  todayKey: string;
  onSelectDay: (day: string) => void;
  onSelectSlot: (slot: PublicSlot) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function SlotPicker({
  businessName,
  initials,
  service,
  employee,
  showEmployee,
  days,
  day,
  slot,
  loading,
  error,
  todayKey,
  onSelectDay,
  onSelectSlot,
  onBack,
  onContinue,
}: SlotPickerProps) {
  const daySlots = days.find(([key]) => key === day)?.[1] ?? [];
  const periods = groupSlotsByPeriod(daySlots);
  const selectedDay = day ? dayParts(day, todayKey) : null;
  const empty = !loading && days.length === 0;

  const action = (
    <Button
      size="lg"
      className="h-12 w-full rounded-2xl text-[15px]"
      disabled={!slot}
      onClick={onContinue}
    >
      Continuar
      <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
    </Button>
  );

  return (
    <WizardShell
      step={3}
      title="Escolha o horário"
      subtitle={`${service.name} · ${formatMinutes(service.duration)}${
        showEmployee ? ` · com ${employee.name}` : ""
      }`}
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
              <dd className="font-medium">{day ? dayChipLabel(day, todayKey) : "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Horário</dt>
              <dd className={slot ? "font-medium tabular-nums" : "text-muted-foreground"}>
                {slot ? serviceWindow(slot.startTime, service.duration) : "A escolher"}
              </dd>
            </div>
          </dl>
        </div>
      }
      mobileSummary={
        empty ? undefined : (
          <div className="flex items-baseline justify-between gap-4">
            <p
              className={`truncate text-sm ${
                slot ? "font-medium tabular-nums" : "text-muted-foreground"
              }`}
            >
              {slot && day
                ? `${dayChipLabel(day, todayKey)} · ${serviceWindow(slot.startTime, service.duration)}`
                : "Selecione um horário"}
            </p>
            <p className="shrink-0 text-sm text-muted-foreground">
              {formatPrice(service.price)}
            </p>
          </div>
        )
      }
    >
      {error && (
        <div className="mt-8 flex items-start gap-3 rounded-2xl bg-muted px-4 py-3.5 lg:max-w-xl">
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {empty ? (
        <div className="mt-12 max-w-md">
          <p className="text-[17px] font-medium">Nenhum horário disponível</p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {service.name} precisa de {formatMinutes(service.duration)} livres em
            sequência.{" "}
            {showEmployee
              ? "Tente outro profissional ou volte mais tarde."
              : "Volte mais tarde ou escolha outro serviço."}
          </p>
          <Button
            variant="outline"
            size="lg"
            className="mt-7 h-11 rounded-2xl"
            onClick={onBack}
          >
            {showEmployee ? "Escolher outro profissional" : "Voltar aos serviços"}
          </Button>
        </div>
      ) : (
        <>
          <section className="mt-10 lg:mt-14">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className={`${EYEBROW} text-muted-foreground`}>Data</h2>
              {selectedDay && (
                <p className="text-sm text-muted-foreground">
                  {selectedDay.month} de {selectedDay.year}
                </p>
              )}
            </div>

            <div className="-mx-5 mt-4 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex snap-x snap-mandatory gap-2">
                {loading
                  ? Array.from({ length: 6 }, (_, index) => (
                      <div
                        key={index}
                        className="h-[76px] w-[72px] shrink-0 animate-pulse rounded-2xl bg-muted"
                      />
                    ))
                  : days.map(([key]) => {
                      const parts = dayParts(key, todayKey);
                      const active = key === day;

                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => onSelectDay(key)}
                          className={`flex w-[72px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl py-4 transition-colors duration-200 active:scale-[0.97] ${FOCUS} ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <span
                            className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
                              active ? "text-primary-foreground/70" : "text-muted-foreground"
                            }`}
                          >
                            {parts.isToday ? "hoje" : parts.weekday}
                          </span>
                          <span className="text-[20px] font-semibold leading-none tabular-nums">
                            {parts.day}
                          </span>
                        </button>
                      );
                    })}
              </div>
            </div>
          </section>

          <section className="mt-10 lg:mt-14">
            <h2 className={`${EYEBROW} text-muted-foreground`}>Horário</h2>

            {loading ? (
              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {Array.from({ length: 12 }, (_, index) => (
                  <div key={index} className="h-12 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : (
              <div
                key={day ?? "sem-dia"}
                className="mt-5 flex flex-col gap-8 duration-200 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
              >
                {periods.map((period) => (
                  <div key={period.label}>
                    <h3 className="text-[13px] text-muted-foreground">{period.label}</h3>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {period.slots.map((option) => {
                        const active = slot?.id === option.id;

                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onSelectSlot(option)}
                            className={`h-12 rounded-xl text-[15px] font-medium tabular-nums transition-colors duration-200 active:scale-[0.97] ${FOCUS} ${
                              active
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground"
                            }`}
                          >
                            {option.startTime}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </WizardShell>
  );
}
