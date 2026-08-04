import { BookingSource, CustomerLinkSource } from "@prisma/client";
import { env } from "../config/env";
import { ConflictError, NotFoundError } from "../lib/errors";
import { sendBookingConfirmationEmail } from "../lib/emails/bookingConfirmation";
import { availabilityRepository } from "../repositories/availabilityRepository";
import { bookingRepository } from "../repositories/bookingRepository";
import { crmRepository } from "../repositories/crmRepository";
import { BookingIdentityInput } from "../repositories/customerRepository";
import { businessRepository } from "../repositories/businessRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import { isSlotUpcoming, normalizeClientName, slotRunForDuration } from "./bookingRules";
import { normalizeEmail, normalizePhoneE164 } from "./identityRules";

export interface CreateBookingInput {
  availabilityId: number;
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  // Só o caminho interno (painel) manda isto: é a atendente escolhendo um
  // prontuário existente no autocomplete em vez de deixar o telefone digitado
  // decidir. O schema da rota pública não declara o campo e recusa
  // `additionalProperties`, então o fluxo público não tem como fixar
  // prontuário de ninguém — a barreira é a rota, não uma checagem aqui.
  profilePublicId?: string;
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

  const clientPhone = input.clientPhone.trim();
  const clientEmail = input.clientEmail?.trim() || null;

  // Prontuário fixado pelo painel. Resolvido aqui, junto das outras validações
  // de existência (serviço, horário), e pelo mesmo motivo: erro de entrada tem
  // que aparecer antes de qualquer escrita.
  //
  // 404 e nunca 403 quando o publicId é de outro negócio (§9.3) — um 403
  // confirmaria que o cadastro existe em algum lugar. Com o CRM desligado o
  // mesmo 404: as rotas de CRM nem estão registradas, então, do ponto de vista
  // de quem pediu, esse cliente realmente não existe.
  let pinnedProfileId: number | null = null;
  if (input.profilePublicId) {
    const pinned = env.crmEnabled
      ? await crmRepository.findProfileByPublicId(businessId, input.profilePublicId)
      : null;
    if (!pinned) {
      throw new NotFoundError("Customer not found");
    }
    pinnedProfileId = pinned.id;
  }

  // Com o CRM desligado nada disto é montado e o repositório não recebe o
  // parâmetro: o caminho da reserva é exatamente o de antes, coluna profileId
  // nula inclusive. Ligar a flag é o que introduz escrita nova.
  const identity: BookingIdentityInput | undefined = env.crmEnabled
    ? {
        businessId,
        clientName,
        pinnedProfileId,
        email: normalizeEmail(clientEmail),
        phoneE164: normalizePhoneE164(clientPhone),
        // Display guarda o que a pessoa digitou; o normalizado serve para
        // encontrar identidade, não para mostrar ao negócio.
        displayPhone: clientPhone || null,
        displayEmail: clientEmail,
        bookedAt: now,
        // Reserva pelo site é o cliente se cadastrando; pelo balcão é a
        // atendente cadastrando por ele. O prontuário registra qual dos dois.
        source:
          source === "ONLINE" ? CustomerLinkSource.PUBLIC_BOOKING : CustomerLinkSource.STAFF,
      }
    : undefined;

  const booking = await bookingRepository.createWithClaim(
    run.map((slotInRun) => slotInRun.id),
    {
      serviceId: service.id,
      // O `businessId` já foi validado contra o serviço e contra o slot logo
      // acima; passar o parâmetro em vez de `service.businessId` mantém uma
      // única fonte de verdade para o tenant nesta função.
      businessId,
      clientName,
      clientPhone,
      clientEmail,
      priceAtBooking: service.price,
      source,
    },
    identity,
  );
  if (!booking) {
    throw new ConflictError("This time slot has just been booked");
  }

  // Aqui e não no chamador: os dois fluxos (público e interno) passam por este
  // ponto, então a confirmação sai uma vez só, sem duplicar código.
  if (booking.clientEmail) {
    try {
      const business = await businessRepository.findById(businessId);
      await sendBookingConfirmationEmail({
        to: booking.clientEmail,
        clientName,
        businessName: business?.name ?? "Time Flow",
        businessAddress: business?.address ?? null,
        serviceName: service.name,
        employeeName: slot.employee.name,
        date: slot.date,
        startTime: slot.startTime,
        durationMinutes: service.duration,
      });
    } catch (error) {
      // A reserva já está no banco e o horário já foi travado: falha de e-mail
      // não pode transformar uma reserva válida em erro para o cliente.
      console.error(`Falha ao enviar confirmação para ${booking.clientEmail}:`, error);
    }
  }

  return {
    booking,
    service,
    slot,
    employeeName: slot.employee.name,
    clientName,
  };
}
