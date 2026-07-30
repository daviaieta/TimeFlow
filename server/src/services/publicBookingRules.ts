import {
  EmployeeSlot,
  NextSlot,
  nextSlotPerEmployee,
  serviceEndTime,
} from "./bookingRules";

// price chega como Prisma Decimal em produção e como string nos testes —
// ambos respondem a toString().
interface PriceLike {
  toString(): string;
}

export interface CatalogService {
  id: number;
  name: string;
  duration: number;
  price: PriceLike;
  employees: { id: number; name: string; avatarUrl: string | null }[];
}

export interface PublicEmployeeDto {
  id: number;
  name: string;
  avatarUrl: string | null;
  nextSlot: NextSlot | null;
}

export interface PublicBusinessDto {
  business: {
    name: string;
    slug: string;
    address: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
  };
  professionals: PublicEmployeeDto[];
  services: {
    id: number;
    name: string;
    duration: number;
    price: string;
    employees: PublicEmployeeDto[];
  }[];
}

export interface PublicSlotDto {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
}

export interface BookingSummary {
  business: string;
  service: string;
  duration: number;
  price: string;
  employee: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
}

// Serviço sem profissional vinculado sai do catálogo: o cliente não pode
// escolher um caminho sem horário possível.
export function toPublicBusinessDto(
  business: {
    name: string;
    slug: string;
    address?: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
  },
  services: CatalogService[],
  freeSlots: EmployeeSlot[],
  now: Date,
): PublicBusinessDto {
  const visible = services.filter((service) => service.employees.length > 0);

  const withNextSlot =
    (nextSlots: Map<number, NextSlot>) =>
    (employee: { id: number; name: string; avatarUrl: string | null }): PublicEmployeeDto => ({
      id: employee.id,
      name: employee.name,
      avatarUrl: employee.avatarUrl,
      nextSlot: nextSlots.get(employee.id) ?? null,
    });

  // Sem serviço escolhido ainda, o card do profissional mostra a primeira
  // vaga qualquer — é só uma prévia de quando ele volta a atender.
  const anySlot = withNextSlot(nextSlotPerEmployee(freeSlots, 0, now));

  // Profissionais do topo: união dos serviços visíveis, na ordem de primeira
  // aparição, sem repetir quem atende mais de um serviço.
  const professionals = new Map<number, PublicEmployeeDto>();
  for (const service of visible) {
    for (const employee of service.employees) {
      if (!professionals.has(employee.id)) {
        professionals.set(employee.id, anySlot(employee));
      }
    }
  }

  return {
    business: {
      name: business.name,
      slug: business.slug,
      address: business.address ?? null,
      logoUrl: business.logoUrl,
      bannerUrl: business.bannerUrl,
    },
    professionals: [...professionals.values()],
    // Cada serviço anuncia a próxima vaga em que ELE cabe: uma descoloração
    // de 1h não pode prometer um buraco de 30min entre dois compromissos.
    services: visible.map((service) => {
      const fits = withNextSlot(
        nextSlotPerEmployee(freeSlots, service.duration, now),
      );

      return {
        id: service.id,
        name: service.name,
        duration: service.duration,
        price: service.price.toString(),
        employees: service.employees.map(fits),
      };
    }),
  };
}

export function toPublicSlotDto(slot: {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
}): PublicSlotDto {
  return {
    id: slot.id,
    date: slot.date.toISOString(),
    startTime: slot.startTime,
    endTime: slot.endTime,
  };
}

// O fim que o cliente lê é o do serviço, não o do slot onde ele começou:
// uma descoloração de 1h numa grade de 30min termina 15:00, não 14:30.
export function buildBookingSummary(args: {
  businessName: string;
  service: { name: string; duration: number; price: PriceLike };
  employeeName: string;
  slot: { date: Date; startTime: string };
  clientName: string;
}): BookingSummary {
  return {
    business: args.businessName,
    service: args.service.name,
    duration: args.service.duration,
    price: args.service.price.toString(),
    employee: args.employeeName,
    date: args.slot.date.toISOString(),
    startTime: args.slot.startTime,
    endTime: serviceEndTime(args.slot.startTime, args.service.duration),
    clientName: args.clientName,
  };
}
