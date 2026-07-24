"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Availability } from "@/lib/types";
import { formatBusinessName } from "@/lib/businessName";
import { estimateGeneratedSlots } from "@/lib/generatePlan";
import {
  formatDuration,
  formatMinutes,
  groupByDate,
  localDayKey,
  partitionByDay,
  summarizeDay,
  toMinutes,
} from "@/lib/schedule";
import { useAuthUser } from "../auth-context";

// Índices batem com Date.getUTCDay() / o weekdays da API (0=dom … 6=sáb)
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export default function SchedulePage() {
  const user = useAuthUser();

  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Availability | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [clientName, setClientName] = useState("");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [genOpen, setGenOpen] = useState(false);
  const [genStart, setGenStart] = useState("");
  const [genEnd, setGenEnd] = useState("");
  const [genDays, setGenDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [genWorkStart, setGenWorkStart] = useState("09:00");
  const [genWorkEnd, setGenWorkEnd] = useState("18:00");
  const [genBreak, setGenBreak] = useState(true);
  const [genBreakStart, setGenBreakStart] = useState("12:00");
  const [genBreakEnd, setGenBreakEnd] = useState("13:00");
  const [genSlotMinutes, setGenSlotMinutes] = useState(30);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSubmitting, setGenSubmitting] = useState(false);
  const [genResult, setGenResult] = useState<{ created: number; skipped: number } | null>(
    null,
  );

  const [deleting, setDeleting] = useState<Availability | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingSubmitting, setDeletingSubmitting] = useState(false);

  const loadAvailabilities = useCallback(() => {
    return fetchAdapter<{ availabilities: Availability[] }>({
      method: "GET",
      path: "/availabilities",
    })
      .then(({ data }) => {
        setAvailabilities(data.availabilities);
        setListError(null);
      })
      .catch((err) => {
        setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadAvailabilities();
  }, [loadAvailabilities]);

  if (user.role !== "EMPLOYEE") {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <p className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">
          A agenda de horários é gerenciada por cada colaborador.
        </p>
      </div>
    );
  }

  function openCreate() {
    setEditing(null);
    setDate("");
    setStartTime("");
    setEndTime("");
    setClientName("");
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(availability: Availability) {
    setEditing(availability);
    setDate(availability.date.slice(0, 10));
    setStartTime(availability.startTime);
    setEndTime(availability.endTime);
    setClientName(availability.clientName ?? "");
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const body = { date, startTime, endTime, clientName: clientName.trim() || null };

    try {
      if (editing) {
        await fetchAdapter({
          method: "PUT",
          path: `/availabilities/${editing.id}`,
          body,
        });
      } else {
        await fetchAdapter({ method: "POST", path: "/availabilities", body });
      }
      setDialogOpen(false);
      await loadAvailabilities();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  function openGenerate() {
    const today = new Date();
    const inThirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    setGenStart(localDayKey(today));
    setGenEnd(localDayKey(inThirtyDays));
    setGenError(null);
    setGenResult(null);
    setGenOpen(true);
  }

  function toggleGenDay(day: number) {
    setGenDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    );
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenError(null);
    setGenSubmitting(true);

    try {
      const { data } = await fetchAdapter<{ created: number; skipped: number }>({
        method: "POST",
        path: "/availabilities/generate",
        body: {
          startDate: genStart,
          endDate: genEnd,
          weekdays: genDays,
          workStart: genWorkStart,
          workEnd: genWorkEnd,
          slotMinutes: genSlotMinutes,
          ...(genBreak ? { breakStart: genBreakStart, breakEnd: genBreakEnd } : {}),
        },
      });
      setGenResult(data);
    } catch (err) {
      setGenError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setGenSubmitting(false);
    }
  }

  async function closeGenerate() {
    setGenOpen(false);
    if (genResult && genResult.created > 0) {
      await loadAvailabilities();
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteError(null);
    setDeletingSubmitting(true);

    try {
      await fetchAdapter({
        method: "DELETE",
        path: `/availabilities/${deleting.id}`,
      });
      setDeleting(null);
      await loadAvailabilities();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setDeletingSubmitting(false);
    }
  }

  const todayKey = localDayKey(new Date());
  const { upcoming, past } = partitionByDay(availabilities, todayKey);
  // Passados do mais recente para o mais antigo: quem abre o histórico quer o
  // dia que acabou de passar, não o de meses atrás.
  const visible = tab === "past" ? [...past].reverse() : upcoming;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          {user.business && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {formatBusinessName(user.business.name)}
            </p>
          )}
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Agenda</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie seus horários disponíveis para agendamento.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={openGenerate}>
            <HugeiconsIcon icon={Calendar03Icon} data-icon="inline-start" />
            Gerar horários
          </Button>
          <Button onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            Novo horário
          </Button>
        </div>
      </div>

      {!loading && !listError && past.length > 0 && (
        <div className="mt-6 inline-flex rounded-lg border bg-card p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setTab("upcoming")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === "upcoming"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Próximos
          </button>
          <button
            type="button"
            onClick={() => setTab("past")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === "past"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Passados
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border bg-card p-12">
            <Spinner />
          </div>
        ) : listError ? (
          <p className="rounded-2xl border bg-card p-12 text-center text-sm text-destructive">
            {listError}
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">
            {tab === "past"
              ? "Nenhum horário passado."
              : "Nenhum horário à frente. Crie seus horários livres para que clientes possam reservar."}
          </p>
        ) : (
          groupByDate(visible).map(([day, slots]) => {
            const resumo = summarizeDay(slots);
            const isToday = day === todayKey;

            return (
              <section key={day} className="overflow-hidden rounded-2xl border bg-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3.5">
                  <h2 className="text-sm font-semibold capitalize">
                    {isToday && (
                      <span className="text-indigo-600 dark:text-indigo-400">HOJE · </span>
                    )}
                    {formatDate(day)}
                  </h2>
                  <span className="text-xs text-muted-foreground">{resumo.label}</span>
                </div>

                <div className="px-5 py-4">
                  {slots.map((slot, index) => {
                    const previous = slots[index - 1];
                    const gap = previous
                      ? toMinutes(slot.startTime) - toMinutes(previous.endTime)
                      : 0;

                    return (
                      <div key={slot.id}>
                        {gap > 0 && (
                          <div className="grid grid-cols-[56px_1fr] gap-3">
                            <div className="pt-1 text-right text-[11px] text-muted-foreground/40">
                              ···
                            </div>
                            <div className="border-l-2 border-dotted py-2 pl-4 text-xs text-muted-foreground/60">
                              {formatMinutes(gap)} sem horários cadastrados
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-[56px_1fr] gap-3">
                          <div className="pt-2.5 text-right text-[11px] tabular-nums text-muted-foreground">
                            {slot.startTime}
                          </div>
                          <div className="relative border-l-2 pb-3 pl-4">
                            <span className="absolute -left-[5px] top-3 size-2 rounded-full bg-border" />
                            <div
                              className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 ${
                                slot.isBooked
                                  ? "border border-l-[3px] border-indigo-500/35 border-l-indigo-500 bg-indigo-500/10"
                                  : "border border-dashed"
                              }`}
                            >
                              <div className="min-w-0">
                                <p
                                  className={`truncate text-sm font-semibold ${
                                    slot.isBooked ? "" : "text-muted-foreground/60"
                                  }`}
                                >
                                  {slot.clientName ?? "Livre"}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {slot.startTime} – {slot.endTime} ·{" "}
                                  {formatDuration(slot.startTime, slot.endTime)}
                                </p>
                              </div>

                              {slot.locked ? (
                                <Badge>Reservado</Badge>
                              ) : (
                                <div className="flex shrink-0 gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Editar horário"
                                    onClick={() => openEdit(slot)}
                                  >
                                    <HugeiconsIcon icon={PencilEdit02Icon} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Excluir horário"
                                    onClick={() => {
                                      setDeleteError(null);
                                      setDeleting(slot);
                                    }}
                                  >
                                    <HugeiconsIcon icon={Delete02Icon} />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar horário" : "Novo horário"}</DialogTitle>
            <DialogDescription>
              Defina o dia e o intervalo em que você está disponível.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="slot-date">Data</FieldLabel>
                <Input
                  id="slot-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="slot-start">Início</FieldLabel>
                  <Input
                    id="slot-start"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="slot-end">Fim</FieldLabel>
                  <Input
                    id="slot-end"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="slot-client">Cliente (opcional)</FieldLabel>
                <Input
                  id="slot-client"
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Nome de quem vai ocupar o horário"
                  maxLength={80}
                />
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para manter o horário livre para agendamento.
                </p>
              </Field>
              {formError && <FieldError>{formError}</FieldError>}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Salvando…
                    </>
                  ) : (
                    "Salvar"
                  )}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={genOpen}
        onOpenChange={(open) => {
          if (!open) void closeGenerate();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar horários</DialogTitle>
            <DialogDescription>
              Informe sua jornada e o sistema cria todos os horários do período
              de uma vez.
            </DialogDescription>
          </DialogHeader>

          {genResult ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-6" />
              </div>
              <p className="text-sm">
                <span className="font-semibold">{genResult.created}</span> horários
                criados
                {genResult.skipped > 0 && (
                  <>
                    {" · "}
                    <span className="text-muted-foreground">
                      {genResult.skipped} pulados
                    </span>
                  </>
                )}
              </p>
              {genResult.skipped > 0 && (
                <p className="text-xs text-muted-foreground">
                  Pulados são horários que já existiam ou que conflitam com
                  outros na sua agenda.
                </p>
              )}
              <Button className="mt-2" onClick={() => void closeGenerate()}>
                Fechar
              </Button>
            </div>
          ) : (
            <form onSubmit={handleGenerate}>
              <FieldGroup>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="gen-start">De</FieldLabel>
                    <Input
                      id="gen-start"
                      type="date"
                      value={genStart}
                      onChange={(event) => setGenStart(event.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="gen-end">Até</FieldLabel>
                    <Input
                      id="gen-end"
                      type="date"
                      value={genEnd}
                      onChange={(event) => setGenEnd(event.target.value)}
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
                        aria-pressed={genDays.includes(index)}
                        onClick={() => toggleGenDay(index)}
                        className={`size-9 rounded-lg border text-xs font-semibold transition-colors ${
                          genDays.includes(index)
                            ? "border-indigo-500 bg-indigo-500 text-white"
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
                      value={genWorkStart}
                      onChange={(event) => setGenWorkStart(event.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="gen-work-end">Saída</FieldLabel>
                    <Input
                      id="gen-work-end"
                      type="time"
                      value={genWorkEnd}
                      onChange={(event) => setGenWorkEnd(event.target.value)}
                      required
                    />
                  </Field>
                </div>

                <Field>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={genBreak}
                      onChange={(event) => setGenBreak(event.target.checked)}
                      className="size-4 accent-indigo-500"
                    />
                    Pausa para almoço
                  </label>
                </Field>

                {genBreak && (
                  <div className="grid grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel htmlFor="gen-break-start">Início da pausa</FieldLabel>
                      <Input
                        id="gen-break-start"
                        type="time"
                        value={genBreakStart}
                        onChange={(event) => setGenBreakStart(event.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="gen-break-end">Fim da pausa</FieldLabel>
                      <Input
                        id="gen-break-end"
                        type="time"
                        value={genBreakEnd}
                        onChange={(event) => setGenBreakEnd(event.target.value)}
                        required
                      />
                    </Field>
                  </div>
                )}

                <Field>
                  <FieldLabel htmlFor="gen-slot">Duração de cada horário</FieldLabel>
                  <select
                    id="gen-slot"
                    value={genSlotMinutes}
                    onChange={(event) => setGenSlotMinutes(Number(event.target.value))}
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
                      startDate: genStart,
                      endDate: genEnd,
                      weekdays: genDays,
                      workStart: genWorkStart,
                      workEnd: genWorkEnd,
                      slotMinutes: genSlotMinutes,
                      ...(genBreak
                        ? { breakStart: genBreakStart, breakEnd: genBreakEnd }
                        : {}),
                    })}
                  </span>{" "}
                  horários serão criados
                </p>

                {genError && <FieldError>{genError}</FieldError>}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void closeGenerate()}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={genSubmitting || genDays.length === 0}>
                    {genSubmitting ? (
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

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir horário</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir o horário de {deleting?.startTime} a {deleting?.endTime}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSubmitting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingSubmitting}
              onClick={() => {
                void handleDelete();
              }}
            >
              {deletingSubmitting ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Excluindo…
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
