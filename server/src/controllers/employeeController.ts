import { FastifyReply, FastifyRequest } from "fastify";
import { readUploadedImage } from "../lib/readUploadedImage";
import { requireBusinessId } from "../lib/requireBusinessId";
import { employeeService } from "../services/employeeService";

export interface CreateEmployeeBody {
  name: string;
  email: string;
}

export interface EmployeeParams {
  id: number;
}

export interface LinkServiceBody {
  serviceId: number;
}

export interface UnlinkServiceParams {
  id: number;
  serviceId: number;
}

export async function listEmployees(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const employees = await employeeService.listEmployees(requireBusinessId(request));
  reply.send({ employees });
}

export async function createEmployee(
  request: FastifyRequest<{ Body: CreateEmployeeBody }>,
  reply: FastifyReply,
): Promise<void> {
  const employee = await employeeService.createEmployee(requireBusinessId(request), request.body);
  reply.status(201).send({ employee });
}

export async function deleteEmployee(
  request: FastifyRequest<{ Params: EmployeeParams }>,
  reply: FastifyReply,
): Promise<void> {
  await employeeService.deleteEmployee(requireBusinessId(request), request.params.id);
  reply.status(204).send();
}

export async function linkService(
  request: FastifyRequest<{ Params: EmployeeParams; Body: LinkServiceBody }>,
  reply: FastifyReply,
): Promise<void> {
  await employeeService.linkService(
    requireBusinessId(request),
    request.params.id,
    request.body.serviceId,
  );
  reply.status(204).send();
}

export async function unlinkService(
  request: FastifyRequest<{ Params: UnlinkServiceParams }>,
  reply: FastifyReply,
): Promise<void> {
  await employeeService.unlinkService(
    requireBusinessId(request),
    request.params.id,
    request.params.serviceId,
  );
  reply.status(204).send();
}

export async function uploadEmployeeAvatar(
  request: FastifyRequest<{ Params: EmployeeParams }>,
  reply: FastifyReply,
): Promise<void> {
  const bytes = await readUploadedImage(request);
  const employee = await employeeService.updateAvatar(
    { id: request.user.sub, role: request.user.role, businessId: request.user.businessId },
    request.params.id,
    bytes,
  );

  reply.send({ employee });
}

export async function deleteEmployeeAvatar(
  request: FastifyRequest<{ Params: EmployeeParams }>,
  reply: FastifyReply,
): Promise<void> {
  const employee = await employeeService.removeAvatar(
    { id: request.user.sub, role: request.user.role, businessId: request.user.businessId },
    request.params.id,
  );

  reply.send({ employee });
}
