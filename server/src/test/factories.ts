import { PlanName, Role, SubscriptionStatus } from "@prisma/client";
import { testPrisma } from "./testDb";

// Data futura fixa a partir de "hoje": os slots precisam passar por
// `isSlotUpcoming`, que compara com o relógio do servidor. Meia-noite UTC é
// como a aplicação grava `Availability.date`.
export function futureDate(daysAhead = 3): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

interface BusinessOptions {
  slug: string;
  name?: string;
  subscriptionStatus?: SubscriptionStatus;
}

export async function createBusiness({
  slug,
  name = `Negócio ${slug}`,
  subscriptionStatus = SubscriptionStatus.ACTIVE,
}: BusinessOptions) {
  return testPrisma.business.create({
    data: {
      name,
      slug,
      subscriptionStatus,
      planName: subscriptionStatus === SubscriptionStatus.ACTIVE ? PlanName.ESSENCIAL : null,
    },
  });
}

export async function createUser(businessId: number, role: Role, email: string) {
  return testPrisma.user.create({
    data: {
      name: `${role} ${email}`,
      email,
      // Hash irrelevante: os testes assinam o JWT direto, sem passar pelo login.
      password: "$2b$10$naoUsadoNosTestesDeIntegracao000000000000000000000000",
      role,
      businessId,
    },
  });
}

export async function createService(
  businessId: number,
  { name = "Corte", duration = 30, price = 50 } = {},
) {
  return testPrisma.service.create({
    data: { name, duration, price, businessId },
  });
}

export async function linkEmployeeToService(employeeId: number, serviceId: number) {
  return testPrisma.employeeService.create({ data: { employeeId, serviceId } });
}

// Cria uma grade de slots consecutivos de 30 minutos a partir de startTime.
export async function createSlots(employeeId: number, startTimes: string[], date = futureDate()) {
  const slots = [];

  for (const startTime of startTimes) {
    const [hour, minute] = startTime.split(":").map(Number);
    const endMinutes = hour * 60 + minute + 30;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(
      endMinutes % 60,
    ).padStart(2, "0")}`;

    slots.push(
      await testPrisma.availability.create({
        data: { employeeId, date, startTime, endTime },
      }),
    );
  }

  return slots;
}

// Um negócio completo e pronto para receber reservas: ADMIN, EMPLOYEE,
// serviço vinculado ao EMPLOYEE e a grade de horários pedida.
export async function seedBookableBusiness(
  slug: string,
  { duration = 30, startTimes = ["09:00"] } = {},
) {
  const business = await createBusiness({ slug });
  const admin = await createUser(business.id, Role.ADMIN, `admin@${slug}.test`);
  const employee = await createUser(business.id, Role.EMPLOYEE, `employee@${slug}.test`);
  const service = await createService(business.id, { duration });
  await linkEmployeeToService(employee.id, service.id);
  const slots = await createSlots(employee.id, startTimes);

  return { business, admin, employee, service, slots };
}
