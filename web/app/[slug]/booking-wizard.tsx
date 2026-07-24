"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { businessInitials, formatBusinessName } from "@/lib/businessName";
import { formatMinutes, localDayKey } from "@/lib/schedule";
import {
  BookingSummary,
  PublicBusiness,
  PublicEmployee,
  PublicService,
  PublicSlot,
  dayChipLabel,
  earliestNextSlot,
  formatPrice,
  groupSlotsByDay,
  isValidPhone,
  nextSlotLabel,
} from "@/lib/publicBooking";

type Step = "service" | "employee" | "slot" | "details" | "success";

const STEP_ORDER: Step[] = ["service", "employee", "slot", "details"];

const STEP_TITLES: Record<Exclude<Step, "success">, string> = {
  service: "Escolha o serviço",
  employee: "Com quem?",
  slot: "Escolha o horário",
  details: "Seus dados",
};

function formatFullDate(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export function BookingWizard({ slug }: { slug: string }) {
  const [catalog, setCatalog] = useState<PublicBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<PublicService | null>(null);
  const [employee, setEmployee] = useState<PublicEmployee | null>(null);
  const [employeeSkipped, setEmployeeSkipped] = useState(false);

  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<PublicSlot | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingSummary | null>(null);

  const loadCatalog = useCallback(() => {
    return fetchAdapter<PublicBusiness>({
      method: "GET",
      path: `/public/businesses/${slug}`,
    })
      .then(({ data }) => setCatalog(data))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setMissing(true);
        else setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const loadSlots = useCallback(
    (employeeId: number) => {
      setSlotsLoading(true);
      setSlotsError(null);
      setSlot(null);
      return fetchAdapter<{ slots: PublicSlot[] }>({
        method: "GET",
        path: `/public/businesses/${slug}/employees/${employeeId}/slots`,
      })
        .then(({ data }) => {
          setSlots(data.slots);
          setDay(data.slots[0]?.date.slice(0, 10) ?? null);
        })
        .catch(() => setSlotsError("Não foi possível carregar os horários."))
        .finally(() => setSlotsLoading(false));
    },
    [slug],
  );

  if (missing) notFound();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 dark:bg-background">
        <Spinner />
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-50 px-6 dark:bg-background">
        <p className="text-center text-sm text-muted-foreground">
          {loadError
            ? "Não foi possível carregar a página. Verifique sua conexão."
            : "Página indisponível no momento."}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            setLoadError(false);
            loadCatalog();
          }}
        >
          Tentar de novo
        </Button>
      </div>
    );
  }

  const businessName = formatBusinessName(catalog.business.name);
  const todayKey = localDayKey(new Date());

  function chooseService(s: PublicService) {
    setService(s);
    setSlotsError(null);
    if (s.employees.length === 1) {
      setEmployee(s.employees[0]);
      setEmployeeSkipped(true);
      setStep("slot");
      loadSlots(s.employees[0].id);
    } else {
      setEmployeeSkipped(false);
      setStep("employee");
    }
  }

  function chooseEmployee(e: PublicEmployee) {
    setEmployee(e);
    setStep("slot");
    loadSlots(e.id);
  }

  function goBack() {
    if (step === "employee") setStep("service");
    else if (step === "slot") setStep(employeeSkipped ? "service" : "employee");
    else if (step === "details") setStep("slot");
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service || !slot) return;
    if (!isValidPhone(clientPhone)) {
      setFormError("Informe um WhatsApp válido.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const { data } = await fetchAdapter<{ booking: BookingSummary }>({
        method: "POST",
        path: `/public/businesses/${slug}/bookings`,
        body: {
          availabilityId: slot.id,
          serviceId: service.id,
          clientName,
          clientPhone,
          ...(clientEmail.trim() ? { clientEmail: clientEmail.trim() } : {}),
        },
      });
      setConfirmation(data.booking);
      setStep("success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && employee) {
        // Corrida: outro cliente levou o horário — volta e recarrega.
        setStep("slot");
        setSlotsError("Esse horário acabou de ser reservado. Escolha outro.");
        loadSlots(employee.id);
      } else {
        setFormError(err instanceof ApiError ? err.message : "Erro inesperado.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "success" && confirmation) {
    return (
      <div className="flex min-h-dvh flex-col items-center bg-zinc-50 px-5 py-12 dark:bg-background">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-7" />
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Agendado!</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {confirmation.clientName}, seu horário está confirmado.
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border bg-card">
            <div className="border-b px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {formatBusinessName(confirmation.business)}
              </p>
              <p className="mt-1 text-base font-semibold">{confirmation.service}</p>
              <p className="text-sm text-muted-foreground">
                {formatMinutes(confirmation.duration)} · {formatPrice(confirmation.price)}
              </p>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4 text-sm">
              <p className="flex items-center gap-2.5">
                <HugeiconsIcon icon={UserIcon} className="size-4 text-muted-foreground" />
                {confirmation.employee}
              </p>
              <p className="flex items-center gap-2.5 capitalize">
                <HugeiconsIcon icon={Calendar03Icon} className="size-4 text-muted-foreground" />
                {formatFullDate(confirmation.date)}
              </p>
              <p className="flex items-center gap-2.5 tabular-nums">
                <HugeiconsIcon icon={Clock01Icon} className="size-4 text-muted-foreground" />
                {confirmation.startTime} – {confirmation.endTime}
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Guarde estes dados: você vai precisar deles ao chegar. Em caso de
            imprevisto, entre em contato direto com {businessName}.
          </p>
        </div>
      </div>
    );
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const businessNextSlot = earliestNextSlot(catalog.professionals);
  const groups = groupSlotsByDay(slots);
  const daySlots = groups.find(([key]) => key === day)?.[1] ?? [];

  return (
    <div className="flex min-h-dvh flex-col items-center bg-zinc-50 px-5 py-8 dark:bg-background">
      <div className="w-full max-w-md">
        {step === "service" ? (
          <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-lg">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-white/30 bg-white/20 text-base font-bold backdrop-blur">
              {businessInitials(catalog.business.name)}
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{businessName}</h1>
            <p className="mt-1 text-sm text-white/80">
              Agende online em menos de 1 minuto — sem criar conta.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/80">
              <span>
                <span className="block text-base font-bold text-white">
                  {catalog.services.length}
                </span>
                {catalog.services.length === 1 ? "serviço" : "serviços"}
              </span>
              <span>
                <span className="block text-base font-bold text-white">
                  {catalog.professionals.length}
                </span>
                {catalog.professionals.length === 1 ? "profissional" : "profissionais"}
              </span>
              {businessNextSlot && (
                <span>
                  <span className="block text-base font-bold text-white">
                    {businessNextSlot.date.slice(0, 10) === todayKey
                      ? "Hoje"
                      : dayChipLabel(businessNextSlot.date.slice(0, 10), todayKey)}
                  </span>
                  próxima vaga
                </span>
              )}
            </div>
          </header>
        ) : (
          <header className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
              {businessInitials(catalog.business.name)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight">
                {businessName}
              </h1>
              <p className="text-xs text-muted-foreground">
                Passo {stepIndex + 1} de 4 ·{" "}
                {STEP_TITLES[step as Exclude<Step, "success">]}
              </p>
            </div>
          </header>
        )}

        <div className="mt-4 flex gap-1.5">
          {STEP_ORDER.map((s, index) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                index <= stepIndex ? "bg-indigo-500" : "bg-border"
              }`}
            />
          ))}
        </div>

        {step !== "service" && (
          <button
            type="button"
            onClick={goBack}
            className="mt-5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />
            Voltar
          </button>
        )}

        {(service || employee || slot) && step !== "service" && (
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-dashed px-4 py-2.5 text-xs text-muted-foreground">
            {service && <span className="font-medium text-foreground">{service.name}</span>}
            {employee && !employeeSkipped && (
              <>
                <span>·</span>
                <span>{employee.name}</span>
              </>
            )}
            {slot && day && (
              <>
                <span>·</span>
                <span className="tabular-nums">
                  {dayChipLabel(day, todayKey)} {slot.startTime}
                </span>
              </>
            )}
          </div>
        )}

        <main className="mt-6">
          {step === "service" && (
            <div className="flex flex-col gap-3">
              {catalog.services.length === 0 && (
                <p className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
                  Este negócio ainda não tem serviços disponíveis para
                  agendamento online.
                </p>
              )}
              {catalog.services.map((s) => {
                const next = earliestNextSlot(s.employees);

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => chooseService(s)}
                    className="group flex items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4 text-left transition-colors hover:border-indigo-500/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{s.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatMinutes(s.duration)} · {formatPrice(s.price)}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        com {s.employees.map((e) => e.name).join(", ")}
                      </p>
                      {next && (
                        <span className="mt-2 inline-flex rounded-full bg-indigo-500/12 px-2.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                          Próximo: {nextSlotLabel(next, todayKey)}
                        </span>
                      )}
                    </div>
                    <HugeiconsIcon
                      icon={ArrowRight02Icon}
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    />
                  </button>
                );
              })}

              {catalog.professionals.length > 0 && (
                <section className="mt-4">
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Profissionais
                  </h2>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {catalog.professionals.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card px-3 py-4 text-center"
                      >
                        <div className="flex size-11 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="mt-0.5 truncate text-sm font-semibold">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.nextSlot ? nextSlotLabel(p.nextSlot, todayKey) : "sem vagas"}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {step === "employee" && service && (
            <div className="flex flex-col gap-3">
              {service.employees.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => chooseEmployee(e)}
                  className="group flex items-center gap-4 rounded-2xl border bg-card px-5 py-4 text-left transition-colors hover:border-indigo-500/50"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {e.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="flex-1 text-sm font-semibold">{e.name}</p>
                  <HugeiconsIcon
                    icon={ArrowRight02Icon}
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              ))}
            </div>
          )}

          {step === "slot" && (
            <div>
              {slotsError && (
                <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                  {slotsError}
                </p>
              )}
              {slotsLoading ? (
                <div className="flex items-center justify-center rounded-2xl border bg-card p-12">
                  <Spinner />
                </div>
              ) : groups.length === 0 ? (
                <p className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
                  Sem horários disponíveis no momento. Volte mais tarde ou
                  escolha outro profissional.
                </p>
              ) : (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {groups.map(([key]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setDay(key);
                          setSlot(null);
                        }}
                        className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
                          day === key
                            ? "border-indigo-500 bg-indigo-500 text-white"
                            : "bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {dayChipLabel(key, todayKey)}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {daySlots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSlot(s)}
                        className={`rounded-xl border py-2.5 text-sm font-medium tabular-nums transition-colors ${
                          slot?.id === s.id
                            ? "border-indigo-500 bg-indigo-500 text-white"
                            : "bg-card hover:border-indigo-500/50"
                        }`}
                      >
                        {s.startTime}
                      </button>
                    ))}
                  </div>

                  <Button
                    className="mt-6 w-full"
                    size="lg"
                    disabled={!slot}
                    onClick={() => setStep("details")}
                  >
                    Continuar
                    <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
                  </Button>
                </>
              )}
            </div>
          )}

          {step === "details" && service && slot && day && (
            <form onSubmit={handleConfirm}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="client-name">Nome</FieldLabel>
                  <Input
                    id="client-name"
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    placeholder="Como devemos te chamar?"
                    maxLength={80}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="client-phone">WhatsApp</FieldLabel>
                  <Input
                    id="client-phone"
                    type="tel"
                    value={clientPhone}
                    onChange={(event) => setClientPhone(event.target.value)}
                    placeholder="(11) 99999-0000"
                    maxLength={20}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="client-email">E-mail (opcional)</FieldLabel>
                  <Input
                    id="client-email"
                    type="email"
                    value={clientEmail}
                    onChange={(event) => setClientEmail(event.target.value)}
                    placeholder="voce@email.com"
                    maxLength={120}
                  />
                </Field>
                {formError && <FieldError>{formError}</FieldError>}
                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Confirmando…
                    </>
                  ) : (
                    <>
                      Confirmar · {dayChipLabel(day, todayKey)} {slot.startTime}
                    </>
                  )}
                </Button>
              </FieldGroup>
            </form>
          )}
        </main>

        <footer className="mt-10 text-center">
          <Link
            href="/"
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            ⚡ Agendamentos por Time Flow
          </Link>
        </footer>
      </div>
    </div>
  );
}
