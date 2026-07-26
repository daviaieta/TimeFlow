import { FastifyReply, FastifyRequest } from "fastify";
import { publicBookingService } from "../services/publicBookingService";

export interface PublicBusinessParams {
  slug: string;
}

export interface PublicSlotsParams {
  slug: string;
  employeeId: number;
}

export interface PublicSlotsQuery {
  serviceId: number;
}

export interface PublicBookingBody {
  availabilityId: number;
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
}

export async function getPublicBusiness(
  request: FastifyRequest<{ Params: PublicBusinessParams }>,
  reply: FastifyReply,
): Promise<void> {
  const page = await publicBookingService.getBusinessPage(request.params.slug);
  reply.send(page);
}

export async function listPublicSlots(
  request: FastifyRequest<{ Params: PublicSlotsParams; Querystring: PublicSlotsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const slots = await publicBookingService.listEmployeeSlots(
    request.params.slug,
    request.params.employeeId,
    request.query.serviceId,
    new Date(),
  );
  reply.send({ slots });
}

export async function createPublicBooking(
  request: FastifyRequest<{ Params: PublicBusinessParams; Body: PublicBookingBody }>,
  reply: FastifyReply,
): Promise<void> {
  const booking = await publicBookingService.createBooking(
    request.params.slug,
    request.body,
    new Date(),
  );
  reply.status(201).send({ booking });
}
