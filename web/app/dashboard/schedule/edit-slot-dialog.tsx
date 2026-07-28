"use client";

import { FormEvent, useState } from "react";
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
import type { Availability } from "@/lib/types";

interface EditSlotDialogProps {
  slot: Availability;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

// Montado só enquanto há um horário sendo editado, com `key` no id do slot:
// o formulário nasce preenchido pelo estado inicial, sem effect de sincronia.
export function EditSlotDialog({ slot, onClose, onSaved }: EditSlotDialogProps) {
  const [date, setDate] = useState(slot.date.slice(0, 10));
  const [startTime, setStartTime] = useState(slot.startTime);
  const [endTime, setEndTime] = useState(slot.endTime);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await fetchAdapter({
        method: "PUT",
        path: `/availabilities/${slot.id}`,
        body: { date, startTime, endTime },
      });
      onClose();
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar horário</DialogTitle>
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
            {error && <FieldError>{error}</FieldError>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
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
  );
}
