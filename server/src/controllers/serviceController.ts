import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import { serviceService } from "../services/serviceService";

export interface ServiceBody {
  name: string;
  duration: number;
  price: number;
}

export interface ServiceParams {
  id: number;
}

export async function listServices(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const services = await serviceService.listServices(requireBusinessId(request));
  reply.send({ services });
}

export async function createService(
  request: FastifyRequest<{ Body: ServiceBody }>,
  reply: FastifyReply,
): Promise<void> {
  const service = await serviceService.createService(
    requireBusinessId(request),
    request.body,
  );
  reply.status(201).send({ service });
}

export async function updateService(
  request: FastifyRequest<{ Body: ServiceBody; Params: ServiceParams }>,
  reply: FastifyReply,
): Promise<void> {
  const service = await serviceService.updateService(
    requireBusinessId(request),
    request.params.id,
    request.body,
  );
  reply.send({ service });
}

export async function deleteService(
  request: FastifyRequest<{ Params: ServiceParams }>,
  reply: FastifyReply,
): Promise<void> {
  await serviceService.deleteService(requireBusinessId(request), request.params.id);
  reply.status(204).send();
}
