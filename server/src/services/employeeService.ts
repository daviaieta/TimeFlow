import { Role, User } from "@prisma/client";
import { env } from "../config/env";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { sendEmployeeInviteEmail } from "../lib/emails/invite";
import { generateInviteToken } from "../lib/inviteToken";
import { businessRepository } from "../repositories/businessRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import { userRepository } from "../repositories/userRepository";
import { canEditEmployeeAvatar } from "./accountRules";
import { imageService } from "./imageService";

interface CreateEmployeeInput {
  name: string;
  email: string;
}

interface AvatarActor {
  id: number;
  role: Role;
  businessId: number | null;
}

async function findOwnedEmployee(businessId: number, id: number): Promise<User> {
  const employee = await employeeRepository.findById(id);
  if (!employee || employee.businessId !== businessId || employee.role !== Role.EMPLOYEE) {
    throw new NotFoundError("Employee not found");
  }

  return employee;
}

// A ordem importa. Fora do seu negócio, o alvo simplesmente "não existe" —
// 403 aqui contaria que aquele id é de alguém, e isso vale para QUALQUER
// papel (ADMIN ou EMPLOYEE), não só ADMIN: um EMPLOYEE do negócio A mirando
// um id do negócio B não pode diferenciar "existe mas não é meu" de "não
// existe". `actor.businessId === null` é o caso do SUPERADMIN — sem negócio,
// "mesmo negócio" nunca pode bater por acidente. Dentro do negócio, o 403 é
// informação legítima: você sabe que a pessoa existe, só não pode editá-la.
async function findAvatarTarget(actor: AvatarActor, employeeId: number): Promise<User> {
  const target = await employeeRepository.findById(employeeId);
  if (!target || actor.businessId === null || target.businessId !== actor.businessId) {
    throw new NotFoundError("Employee not found");
  }

  if (!canEditEmployeeAvatar(actor, target)) {
    throw new ForbiddenError("You do not have permission to edit this avatar");
  }

  return target;
}

export const employeeService = {
  async listEmployees(businessId: number) {
    const employees = await employeeRepository.findManyByBusiness(businessId);

    return employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      pendingInvite: employee.password === null,
      avatarUrl: imageService.imageUrl(employee.avatarKey),
      services: employee.services.map((link) => link.service),
    }));
  },

  async createEmployee(businessId: number, input: CreateEmployeeInput) {
    const emailTaken = await userRepository.findByEmail(input.email);
    if (emailTaken) {
      throw new ConflictError("A user with this email already exists");
    }

    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const { token, expiresAt } = generateInviteToken();

    const employee = await employeeRepository.create({
      name: input.name,
      email: input.email,
      businessId,
      inviteToken: token,
      inviteTokenExpiresAt: expiresAt,
    });

    const inviteLink = `${env.webOrigin}/accept-invite?token=${token}`;

    try {
      await sendEmployeeInviteEmail({
        to: employee.email,
        employeeName: employee.name,
        businessName: business.name,
        inviteLink,
      });
    } catch (error) {
      // O employee já foi criado — falha no e-mail não deve desfazer o cadastro.
      console.error(`Failed to send invite email to ${employee.email}:`, error);
      console.log(`Invite link for ${employee.email}: ${inviteLink}`);
    }

    return { id: employee.id, name: employee.name, email: employee.email };
  },

  async deleteEmployee(businessId: number, id: number) {
    await findOwnedEmployee(businessId, id);

    const booked = await employeeRepository.countBookedAvailabilities(id);
    if (booked > 0) {
      throw new ConflictError("This employee has booked time slots and cannot be removed");
    }

    await employeeRepository.deleteWithLinks(id);
  },

  async linkService(businessId: number, employeeId: number, serviceId: number) {
    await findOwnedEmployee(businessId, employeeId);

    const service = await serviceRepository.findById(serviceId);
    if (!service || service.businessId !== businessId) {
      throw new NotFoundError("Service not found");
    }

    await employeeRepository.linkService(employeeId, serviceId);
  },

  async unlinkService(businessId: number, employeeId: number, serviceId: number) {
    await findOwnedEmployee(businessId, employeeId);
    await employeeRepository.unlinkService(employeeId, serviceId);
  },

  async updateAvatar(actor: AvatarActor, employeeId: number, bytes: Buffer) {
    const target = await findAvatarTarget(actor, employeeId);

    // Grava no storage ANTES do banco: na ordem inversa, uma falha no upload
    // deixaria a linha apontando para um objeto que não existe.
    const key = await imageService.storeImage({
      slot: "avatar",
      ownerId: target.id,
      bytes,
    });
    const updated = await employeeRepository.setAvatarKey(target.id, key);
    await imageService.discardImage(target.avatarKey);

    return { id: updated.id, avatarUrl: imageService.imageUrl(updated.avatarKey) };
  },

  async removeAvatar(actor: AvatarActor, employeeId: number) {
    const target = await findAvatarTarget(actor, employeeId);

    const updated = await employeeRepository.setAvatarKey(target.id, null);
    await imageService.discardImage(target.avatarKey);

    return { id: updated.id, avatarUrl: null };
  },
};
