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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { EmployeeServiceLink } from "@/lib/types";

interface BookingDialogProps {
  slotId: number;
  slotLabel: string;
  services: EmployeeServiceLink[];
  onClose: () => void;
  onBooked: () => Promise<void> | void;
}

// Montado só enquanto há um horário selecionado, com `key` no id: fechar e
// abrir noutro horário devolve o formulário em branco sem reset manual.
export function BookingDialog({
  slotId,
  slotLabel,
  services,
  onClose,
  onBooked,
}: BookingDialogProps) {
  const [serviceId, setServiceId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await fetchAdapter({
        method: "POST",
        path: "/bookings",
        body: {
          availabilityId: slotId,
          serviceId: Number(serviceId),
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          ...(clientEmail.trim() ? { clientEmail: clientEmail.trim() } : {}),
        },
      });
      onClose();
      await onBooked();
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
          <DialogTitle>Reservar horário</DialogTitle>
          <DialogDescription className="capitalize">{slotLabel}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="booking-service">Serviço</FieldLabel>
              <Select
                items={services.map((service) => ({
                  value: String(service.id),
                  label: service.name,
                }))}
                value={serviceId}
                onValueChange={(value) => setServiceId(value ?? "")}
              >
                <SelectTrigger id="booking-service" className="w-full">
                  <SelectValue placeholder="Escolha o serviço" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={String(service.id)}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="booking-name">Nome do cliente</FieldLabel>
              <Input
                id="booking-name"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                maxLength={80}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="booking-phone">Telefone</FieldLabel>
              <Input
                id="booking-phone"
                value={clientPhone}
                onChange={(event) => setClientPhone(event.target.value)}
                maxLength={20}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="booking-email">Email (opcional)</FieldLabel>
              <Input
                id="booking-email"
                type="email"
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
                maxLength={120}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !serviceId}>
                {submitting ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    Reservando…
                  </>
                ) : (
                  "Reservar"
                )}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
