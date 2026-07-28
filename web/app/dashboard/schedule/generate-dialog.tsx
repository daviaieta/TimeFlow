"use client";

import { FormEvent, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { estimateGeneratedSlots } from "@/lib/generatePlan";
import { formatMinutes, shiftDayKey } from "@/lib/schedule";

// Índices batem com Date.getUTCDay() / o weekdays da API (0=dom … 6=sáb)
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

interface GenerateDialogProps {
  /** Dia aberto na agenda — o período já começa nele. */
  fromDayKey: string;
  onClose: () => void;
  onGenerated: () => Promise<void> | void;
}

export function GenerateDialog({ fromDayKey, onClose, onGenerated }: GenerateDialogProps) {
  const [startDate, setStartDate] = useState(fromDayKey);
  const [endDate, setEndDate] = useState(() => shiftDayKey(fromDayKey, 30));
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [hasBreak, setHasBreak] = useState(true);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("13:00");
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { data } = await fetchAdapter<{ created: number; skipped: number }>({
        method: "POST",
        path: "/availabilities/generate",
        body: {
          startDate,
          endDate,
          weekdays,
          workStart,
          workEnd,
          slotMinutes,
          ...(hasBreak ? { breakStart, breakEnd } : {}),
        },
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function close() {
    onClose();
    if (result && result.created > 0) {
      await onGenerated();
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && void close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar horários</DialogTitle>
          <DialogDescription>
            Informe sua jornada e o sistema cria todos os horários do período de uma vez.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-6" />
            </div>
            <p className="text-sm">
              <span className="font-semibold">{result.created}</span> horários criados
              {result.skipped > 0 && (
                <>
                  {" · "}
                  <span className="text-muted-foreground">{result.skipped} pulados</span>
                </>
              )}
            </p>
            {result.skipped > 0 && (
              <p className="text-xs text-muted-foreground">
                Pulados são horários que já existiam ou que conflitam com outros na sua
                agenda.
              </p>
            )}
            <Button className="mt-2" onClick={() => void close()}>
              Fechar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="gen-start">De</FieldLabel>
                  <Input
                    id="gen-start"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="gen-end">Até</FieldLabel>
                  <Input
                    id="gen-end"
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    required
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel>Dias da semana</FieldLabel>
                <div className="flex gap-1.5">
                  {WEEKDAY_LABELS.map((label, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-pressed={weekdays.includes(index)}
                      onClick={() => toggleWeekday(index)}
                      className={`size-9 rounded-lg border text-xs font-semibold transition-colors ${
                        weekdays.includes(index)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="gen-work-start">Entrada</FieldLabel>
                  <Input
                    id="gen-work-start"
                    type="time"
                    value={workStart}
                    onChange={(event) => setWorkStart(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="gen-work-end">Saída</FieldLabel>
                  <Input
                    id="gen-work-end"
                    type="time"
                    value={workEnd}
                    onChange={(event) => setWorkEnd(event.target.value)}
                    required
                  />
                </Field>
              </div>

              <Field>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={hasBreak}
                    onChange={(event) => setHasBreak(event.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Pausa para almoço
                </label>
              </Field>

              {hasBreak && (
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="gen-break-start">Início da pausa</FieldLabel>
                    <Input
                      id="gen-break-start"
                      type="time"
                      value={breakStart}
                      onChange={(event) => setBreakStart(event.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="gen-break-end">Fim da pausa</FieldLabel>
                    <Input
                      id="gen-break-end"
                      type="time"
                      value={breakEnd}
                      onChange={(event) => setBreakEnd(event.target.value)}
                      required
                    />
                  </Field>
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="gen-slot">Duração de cada horário</FieldLabel>
                <select
                  id="gen-slot"
                  value={slotMinutes}
                  onChange={(event) => setSlotMinutes(Number(event.target.value))}
                  className="h-9 rounded-md border bg-transparent px-3 text-sm"
                >
                  {[15, 30, 45, 60, 90].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {formatMinutes(minutes)}
                    </option>
                  ))}
                </select>
              </Field>

              <p className="rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                ≈{" "}
                <span className="font-semibold text-foreground">
                  {estimateGeneratedSlots({
                    startDate,
                    endDate,
                    weekdays,
                    workStart,
                    workEnd,
                    slotMinutes,
                    ...(hasBreak ? { breakStart, breakEnd } : {}),
                  })}
                </span>{" "}
                horários serão criados
              </p>

              {error && <FieldError>{error}</FieldError>}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => void close()}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting || weekdays.length === 0}>
                  {submitting ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Gerando…
                    </>
                  ) : (
                    "Gerar"
                  )}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
