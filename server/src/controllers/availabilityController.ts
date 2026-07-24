import { FastifyReply, FastifyRequest } from "fastify";
import { availabilityService } from "../services/availabilityService";

export interface AvailabilityBody {
  date: string;
  startTime: string;
  endTime: string;
  clientName?: string | null;
}

export interface AvailabilityParams {
  id: number;
}

export interface GenerateAvailabilitiesBody {
  startDate: string;
  endDate: string;
  weekdays: number[];
  workStart: string;
  workEnd: string;
  breakStart?: string;
  breakEnd?: string;
  slotMinutes: number;
}

export async function listAvailabilities(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const availabilities = await availabilityService.listAvailabilities(request.user.sub);
  reply.send({ availabilities });
}

export async function createAvailability(
  request: FastifyRequest<{ Body: AvailabilityBody }>,
  reply: FastifyReply,
): Promise<void> {
  const availability = await availabilityService.createAvailability(
    request.user.sub,
    request.body,
  );
  reply.status(201).send({ availability });
}

export async function updateAvailability(
  request: FastifyRequest<{ Body: AvailabilityBody; Params: AvailabilityParams }>,
  reply: FastifyReply,
): Promise<void> {
  const availability = await availabilityService.updateAvailability(
    request.user.sub,
    request.params.id,
    request.body,
  );
  reply.send({ availability });
}

export async function generateAvailabilities(
  request: FastifyRequest<{ Body: GenerateAvailabilitiesBody }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await availabilityService.generateAvailabilities(
    request.user.sub,
    request.body,
  );
  reply.status(201).send(result);
}

export async function deleteAvailability(
  request: FastifyRequest<{ Params: AvailabilityParams }>,
  reply: FastifyReply,
): Promise<void> {
  await availabilityService.deleteAvailability(request.user.sub, request.params.id);
  reply.status(204).send();
}
