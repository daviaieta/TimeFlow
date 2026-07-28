"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatBusinessName } from "@/lib/businessName";
import { localDayKey } from "@/lib/schedule";
import { buildTimeline, summarizeTimeline, type TimelineEvent } from "@/lib/timeline";
import type { Availability, Employee } from "@/lib/types";
import { useAuthUser } from "../auth-context";
import { BookingDialog } from "./booking-dialog";
import { DayNavigator } from "./day-navigator";
import { EditSlotDialog } from "./edit-slot-dialog";
import { EventDetailsDialog } from "./event-details-dialog";
import { GenerateDialog } from "./generate-dialog";
import { Timeline } from "./timeline";

function formatDayLabel(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export default function SchedulePage() {
  const user = useAuthUser();

  // Relógio da tela: alimenta a linha do "agora" e a marcação de passado. Um
  // tick por minuto basta — a agenda tem granularidade de minutos.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = localDayKey(now);
  const [dayKey, setDayKey] = useState(() => localDayKey(new Date()));

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    user.role === "EMPLOYEE" ? user.id : null,
  );

  const [slots, setSlots] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [bookingSlot, setBookingSlot] = useState<Availability | null>(null);
  const [editingSlot, setEditingSlot] = useState<Availability | null>(null);
  const [deletingSlot, setDeletingSlot] = useState<Availability | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [openEvent, setOpenEvent] = useState<TimelineEvent | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  const nowRef = useRef<HTMLDivElement | null>(null);
  const scrolledFor = useRef<string | null>(null);

  const loadDay = useCallback(() => {
    // O corpo roda dentro de um .then() pra não disparar o lint de setState
    // síncrono dentro de effect — vale tanto pro setLoading(true) quanto pro
    // atalho de "nenhum colaborador selecionado".
    return Promise.resolve().then(() => {
      setLoading(true);

      if (selectedEmployeeId === null) {
        setLoading(false);
        return undefined;
      }

      return fetchAdapter<{ date: string; availabilities: Availability[] }>({
        method: "GET",
        path: `/availabilities?employeeId=${selectedEmployeeId}&date=${dayKey}`,
      })
        .then(({ data }) => {
          setSlots(data.availabilities);
          setListError(null);
        })
        .catch((err) => {
          setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
        })
        .finally(() => {
          setLoading(false);
        });
    });
  }, [selectedEmployeeId, dayKey]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  useEffect(() => {
    fetchAdapter<{ employees: Employee[] }>({ method: "GET", path: "/employees" })
      .then(({ data }) => {
        setEmployees(data.employees);
        setSelectedEmployeeId((current) => current ?? data.employees[0]?.id ?? null);
      })
      .catch(() => {
        // A lista serve só ao seletor: se falhar, o erro de carregar a agenda
        // já aparece logo abaixo.
      });
  }, []);

  const items = useMemo(() => buildTimeline(slots, dayKey, now), [slots, dayKey, now]);
  const summary = summarizeTimeline(items);

  // Abrir hoje já posiciona a tela no horário atual: o barbeiro chega no
  // "agora" sem rolar. Só uma vez por dia carregado, senão o tick do relógio
  // roubaria o scroll a cada minuto.
  useEffect(() => {
    if (loading || dayKey !== todayKey || scrolledFor.current === dayKey) return;
    const marker = nowRef.current;
    if (!marker) return;

    scrolledFor.current = dayKey;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    marker.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [loading, dayKey, todayKey, items]);

  const isOwnAgenda = selectedEmployeeId === user.id;
  const canPickEmployee = user.role !== "EMPLOYEE";
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);
  const dayLabel = formatDayLabel(dayKey);

  function goToDay(next: string) {
    setDayKey(next);
    setSelectedSlotId(null);
  }

  async function handleDelete() {
    if (!deletingSlot) return;
    setDeleteError(null);
    setDeleteSubmitting(true);

    try {
      await fetchAdapter({ method: "DELETE", path: `/availabilities/${deletingSlot.id}` });
      setDeletingSlot(null);
      await loadDay();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {user.business && (
            <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              {formatBusinessName(user.business.name)}
            </p>
          )}
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight capitalize">
            {dayLabel}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dayKey === todayKey ? "Hoje · " : ""}
            {summary.label}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canPickEmployee && (
            <Select
              items={employees.map((employee) => ({
                value: String(employee.id),
                label: employee.name,
              }))}
              value={selectedEmployeeId ? String(selectedEmployeeId) : ""}
              onValueChange={(value) => setSelectedEmployeeId(Number(value))}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Escolha um colaborador" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.id)}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          {isOwnAgenda && (
            <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}>
              <HugeiconsIcon icon={Calendar03Icon} data-icon="inline-start" />
              Gerar horários
            </Button>
          )}
        </div>
      </header>

      <div className="mt-5 flex justify-end">
        <DayNavigator dayKey={dayKey} todayKey={todayKey} onChange={goToDay} />
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner />
          </div>
        ) : listError ? (
          <p className="py-24 text-center text-sm text-destructive">{listError}</p>
        ) : selectedEmployeeId === null ? (
          <p className="py-24 text-center text-sm text-muted-foreground">
            {employees.length === 0
              ? "Nenhum colaborador cadastrado ainda."
              : "Escolha um colaborador para ver a agenda."}
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum horário neste dia.
            </p>
            {isOwnAgenda && (
              <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}>
                <HugeiconsIcon icon={Calendar03Icon} data-icon="inline-start" />
                Gerar horários
              </Button>
            )}
          </div>
        ) : (
          <div
            key={dayKey}
            className="duration-200 motion-safe:animate-in motion-safe:fade-in"
          >
            <Timeline
              items={items}
              selectedSlotId={selectedSlotId}
              canManage={isOwnAgenda}
              nowRef={nowRef}
              onSelectSlot={setSelectedSlotId}
              onBook={(item) => setBookingSlot(item.slot)}
              onEdit={(item) => setEditingSlot(item.slot)}
              onDelete={(item) => {
                setDeleteError(null);
                setDeletingSlot(item.slot);
              }}
              onOpenEvent={setOpenEvent}
            />
          </div>
        )}
      </div>

      {generateOpen && (
        <GenerateDialog
          fromDayKey={dayKey}
          onClose={() => setGenerateOpen(false)}
          onGenerated={loadDay}
        />
      )}

      {editingSlot && (
        <EditSlotDialog
          key={editingSlot.id}
          slot={editingSlot}
          onClose={() => setEditingSlot(null)}
          onSaved={loadDay}
        />
      )}

      {bookingSlot && (
        <BookingDialog
          key={bookingSlot.id}
          slotId={bookingSlot.id}
          slotLabel={`${dayLabel} · ${bookingSlot.startTime}`}
          services={selectedEmployee?.services ?? []}
          onClose={() => setBookingSlot(null)}
          onBooked={loadDay}
        />
      )}

      {openEvent && (
        <EventDetailsDialog
          event={openEvent}
          dateLabel={dayLabel}
          onClose={() => setOpenEvent(null)}
        />
      )}

      <AlertDialog
        open={deletingSlot !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingSlot(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir horário</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir o horário de {deletingSlot?.startTime} a {deletingSlot?.endTime}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteSubmitting}
              onClick={() => {
                void handleDelete();
              }}
            >
              {deleteSubmitting ? (
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
