import { BookingSource } from "@prisma/client";
import { ConflictError, NotFoundError } from "../lib/errors";
import { availabilityRepository } from "../repositories/availabilityRepository";
import { bookingRepository } from "../repositories/bookingRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import { isSlotUpcoming, normalizeClientName, slotRunForDuration } from "./bookingRules";

export interface CreateBookingInput {
  availabilityId: number;
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
}

// Núcleo de "cria uma reserva de verdade", compartilhado pelo fluxo público
// (o cliente escolhe pra si) e pelo interno (a atendente escolhe pro
// cliente na loja). O que muda entre os dois é só como o `businessId` é
// resolvido e como a resposta é formatada — a validação e o claim atômico
// do slot são exatamente os mesmos nos dois casos.
export async function createBookingForBusiness(
  businessId: number,
  input: CreateBookingInput,
  now: Date,
  source: BookingSource,
) {
  const service = await serviceRepository.findById(input.serviceId);
  if (!service || service.businessId !== businessId) {
    throw new NotFoundError("Service not found");
  }

  const slot = await availabilityRepository.findByIdForBooking(input.availabilityId);
  if (!slot || slot.employee.businessId !== businessId) {
    throw new NotFoundError("Time slot not found");
  }

  const offers = await employeeRepository.hasServiceLink(slot.employee.id, service.id);
  if (!offers) {
    throw new ConflictError("This professional does not offer this service");
  }

  if (!isSlotUpcoming(slot, now)) {
    throw new ConflictError("This time slot is no longer available");
  }

  if (slot.isBooked) {
    throw new ConflictError("This time slot has just been booked");
  }

  const clientName = normalizeClientName(input.clientName);
  if (!clientName) {
    throw new ConflictError("Client name is required");
  }

  // O cliente (ou a atendente, no fluxo interno) escolhe onde COMEÇA; quem
  // decide onde termina é a duração do serviço. Revalidamos o run no servidor
  // porque a lista que foi mostrada pode ter envelhecido entre a escolha e o
  // envio.
  const free = await availabilityRepository.findManyFreeByEmployee(slot.employee.id);
  const run = slotRunForDuration(
    free.filter((candidate) => isSlotUpcoming(candidate, now)),
    slot.id,
    service.duration,
  );
  if (!run) {
    throw new ConflictError("This service does not fit in the selected time slot");
  }

  const booking = await bookingRepository.createWithClaim(
    run.map((slotInRun) => slotInRun.id),
    {
      serviceId: service.id,
      clientName,
      clientPhone: input.clientPhone.trim(),
      clientEmail: input.clientEmail?.trim() || null,
      source,
    },
  );
  if (!booking) {
    throw new ConflictError("This time slot has just been booked");
  }

  return {
    booking,
    service,
    slot,
    employeeName: slot.employee.name,
    clientName,
  };
}
