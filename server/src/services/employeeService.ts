import { Role, User } from "@prisma/client";
import { env } from "../config/env";
import { ConflictError, NotFoundError } from "../lib/errors";
import { sendEmployeeInviteEmail } from "../lib/emails/invite";
import { generateInviteToken } from "../lib/inviteToken";
import { businessRepository } from "../repositories/businessRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import { userRepository } from "../repositories/userRepository";

interface CreateEmployeeInput {
  name: string;
  email: string;
}

async function findOwnedEmployee(businessId: number, id: number): Promise<User> {
  const employee = await employeeRepository.findById(id);
  if (!employee || employee.businessId !== businessId || employee.role !== Role.EMPLOYEE) {
    throw new NotFoundError("Employee not found");
  }

  return employee;
}

export const employeeService = {
  async listEmployees(businessId: number) {
    const employees = await employeeRepository.findManyByBusiness(businessId);

    return employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      pendingInvite: employee.password === null,
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
};
