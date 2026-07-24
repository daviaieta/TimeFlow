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
  employees: { id: number; name: string }[];
}

export interface NextSlot {
  date: string;
  startTime: string;
}

export interface PublicEmployeeDto {
  id: number;
  name: string;
  nextSlot: NextSlot | null;
}

export interface PublicBusinessDto {
  business: { name: string; slug: string };
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

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// A data do slot é meia-noite UTC; "hoje" vem do relógio local do servidor.
// Produto opera num único fuso — decisão registrada no spec.
export function isSlotUpcoming(
  slot: { date: Date; startTime: string },
  now: Date,
): boolean {
  const slotDay = slot.date.toISOString().slice(0, 10);
  const today = localDayKey(now);

  if (slotDay > today) return true;
  if (slotDay < today) return false;

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return slot.startTime > `${hours}:${minutes}`;
}

// Slots chegam ordenados por data/hora — o primeiro futuro de cada
// profissional vence. Quem não tem vaga à frente fica fora do mapa.
export function firstUpcomingPerEmployee(
  slots: { employeeId: number; date: Date; startTime: string }[],
  now: Date,
): Map<number, NextSlot> {
  const map = new Map<number, NextSlot>();

  for (const slot of slots) {
    if (map.has(slot.employeeId)) continue;
    if (!isSlotUpcoming(slot, now)) continue;

    map.set(slot.employeeId, {
      date: slot.date.toISOString(),
      startTime: slot.startTime,
    });
  }

  return map;
}

// Serviço sem profissional vinculado sai do catálogo: o cliente não pode
// escolher um caminho sem horário possível.
export function toPublicBusinessDto(
  business: { name: string; slug: string },
  services: CatalogService[],
  nextSlots: Map<number, NextSlot>,
): PublicBusinessDto {
  const visible = services.filter((service) => service.employees.length > 0);

  const withNextSlot = (employee: { id: number; name: string }): PublicEmployeeDto => ({
    id: employee.id,
    name: employee.name,
    nextSlot: nextSlots.get(employee.id) ?? null,
  });

  // Profissionais do topo: união dos serviços visíveis, na ordem de primeira
  // aparição, sem repetir quem atende mais de um serviço.
  const professionals = new Map<number, PublicEmployeeDto>();
  for (const service of visible) {
    for (const employee of service.employees) {
      if (!professionals.has(employee.id)) {
        professionals.set(employee.id, withNextSlot(employee));
      }
    }
  }

  return {
    business: { name: business.name, slug: business.slug },
    professionals: [...professionals.values()],
    services: visible.map((service) => ({
      id: service.id,
      name: service.name,
      duration: service.duration,
      price: service.price.toString(),
      employees: service.employees.map(withNextSlot),
    })),
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

export function buildBookingSummary(args: {
  businessName: string;
  service: { name: string; duration: number; price: PriceLike };
  employeeName: string;
  slot: { date: Date; startTime: string; endTime: string };
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
    endTime: args.slot.endTime,
    clientName: args.clientName,
  };
}
