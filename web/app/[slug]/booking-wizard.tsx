"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { businessInitials, formatBusinessName } from "@/lib/businessName";
import { formatMinutes, localDayKey } from "@/lib/schedule";
import {
  BookingSummary,
  PublicBusiness,
  PublicEmployee,
  PublicService,
  PublicSlot,
  formatPrice,
  groupSlotsByDay,
  isValidPhone,
} from "@/lib/publicBooking";
import { DetailsForm } from "./details-form";
import { EmployeePicker } from "./employee-picker";
import { ServicePicker } from "./service-picker";
import { SlotPicker } from "./slot-picker";
import { EYEBROW } from "./wizard-shell";

type Step = "service" | "employee" | "slot" | "details" | "success";

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

  // O serviço vai junto porque a lista depende da duração dele: um horário só
  // aparece se o atendimento couber inteiro a partir dali.
  const loadSlots = useCallback(
    (employeeId: number, serviceId: number) => {
      setSlotsLoading(true);
      setSlotsError(null);
      setSlot(null);
      return fetchAdapter<{ slots: PublicSlot[] }>({
        method: "GET",
        path: `/public/businesses/${slug}/employees/${employeeId}/slots?serviceId=${serviceId}`,
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

  // Trocar de serviço invalida o resto da escolha: o profissional anterior
  // pode nem atender o novo serviço, e os horários dependem da duração.
  function selectService(next: PublicService) {
    if (next.id !== service?.id) {
      setEmployee(null);
      setSlot(null);
      setDay(null);
      setSlots([]);
    }
    setService(next);
  }

  // Serviço com um único profissional pula a etapa "com quem?" — não existe
  // escolha a fazer ali.
  function continueFromService() {
    if (!service) return;
    setSlotsError(null);

    if (service.employees.length === 1) {
      setEmployee(service.employees[0]);
      setEmployeeSkipped(true);
      setStep("slot");
      loadSlots(service.employees[0].id, service.id);
    } else {
      setEmployeeSkipped(false);
      setStep("employee");
    }
  }

  function continueFromEmployee() {
    if (!service || !employee) return;
    setStep("slot");
    loadSlots(employee.id, service.id);
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
        loadSlots(employee.id, service.id);
      } else {
        setFormError(err instanceof ApiError ? err.message : "Erro inesperado.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Cada passo é uma tela cheia própria; aqui fica só o estado que eles
  // compartilham.
  const initials = businessInitials(catalog.business.name);

  if (step === "success" && confirmation) {
    return (
      <div className="flex min-h-dvh flex-col items-center bg-zinc-50 px-5 py-12 dark:bg-background lg:py-20">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-background">
              {initials}
            </span>
            <p className="truncate text-sm font-medium">{businessName}</p>
          </div>

          <div className="mt-10 flex flex-col items-center text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-8" />
            </div>
            <p className={`${EYEBROW} mt-5 text-primary`}>Confirmado</p>
            <h1 className="mt-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] lg:text-[34px]">
              Agendado!
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              {confirmation.clientName}, seu horário está confirmado.
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border bg-card">
            <div className="border-b px-5 py-4">
              <p className={`${EYEBROW} text-muted-foreground`}>
                {formatBusinessName(confirmation.business)}
              </p>
              <p className="mt-1.5 text-base font-semibold">{confirmation.service}</p>
              <p className="text-sm text-muted-foreground">
                {formatMinutes(confirmation.duration)} · {formatPrice(confirmation.price)}
              </p>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 text-sm">
              <p className="flex items-center gap-3 rounded-lg px-2 py-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <HugeiconsIcon icon={UserIcon} className="size-4 text-muted-foreground" />
                </span>
                {confirmation.employee}
              </p>
              <p className="flex items-center gap-3 rounded-lg px-2 py-2 capitalize">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <HugeiconsIcon icon={Calendar03Icon} className="size-4 text-muted-foreground" />
                </span>
                {formatFullDate(confirmation.date)}
              </p>
              <p className="flex items-center gap-3 rounded-lg px-2 py-2 tabular-nums">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <HugeiconsIcon icon={Clock01Icon} className="size-4 text-muted-foreground" />
                </span>
                {confirmation.startTime} – {confirmation.endTime}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-muted/40 px-4 py-3.5 text-center text-xs text-muted-foreground">
            Guarde estes dados: você vai precisar deles ao chegar. Em caso de
            imprevisto, entre em contato direto com {businessName}.
          </div>
        </div>
      </div>
    );
  }

  if (step === "service") {
    return (
      <ServicePicker
        catalog={catalog}
        businessName={businessName}
        selected={service}
        todayKey={todayKey}
        onSelect={selectService}
        onContinue={continueFromService}
      />
    );
  }

  if (step === "employee" && service) {
    return (
      <EmployeePicker
        businessName={businessName}
        initials={initials}
        service={service}
        selected={employee}
        todayKey={todayKey}
        onSelect={setEmployee}
        onBack={goBack}
        onContinue={continueFromEmployee}
      />
    );
  }

  if (step === "slot" && service && employee) {
    return (
      <SlotPicker
        businessName={businessName}
        initials={initials}
        service={service}
        employee={employee}
        showEmployee={!employeeSkipped}
        days={groupSlotsByDay(slots)}
        day={day}
        slot={slot}
        loading={slotsLoading}
        error={slotsError}
        todayKey={todayKey}
        onSelectDay={(key) => {
          setDay(key);
          setSlot(null);
        }}
        onSelectSlot={setSlot}
        onBack={goBack}
        onContinue={() => setStep("details")}
      />
    );
  }

  if (step === "details" && service && employee && slot && day) {
    return (
      <DetailsForm
        businessName={businessName}
        initials={initials}
        service={service}
        employee={employee}
        showEmployee={!employeeSkipped}
        day={day}
        slot={slot}
        todayKey={todayKey}
        clientName={clientName}
        clientPhone={clientPhone}
        clientEmail={clientEmail}
        error={formError}
        submitting={submitting}
        onChangeName={setClientName}
        onChangePhone={setClientPhone}
        onChangeEmail={setClientEmail}
        onBack={goBack}
        onSubmit={handleConfirm}
      />
    );
  }

  return null;
}
