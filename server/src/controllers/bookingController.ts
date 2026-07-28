import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import { CreateBookingInput } from "../services/bookingService";
import { internalBookingService } from "../services/internalBookingService";

export async function createBooking(
  request: FastifyRequest<{ Body: CreateBookingInput }>,
  reply: FastifyReply,
): Promise<void> {
  const booking = await internalBookingService.createBooking(
    requireBusinessId(request),
    request.body,
    new Date(),
  );
  reply.status(201).send({ booking });
}
