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

export interface PublicBusinessDto {
  business: { name: string; slug: string };
  services: {
    id: number;
    name: string;
    duration: number;
    price: string;
    employees: { id: number; name: string }[];
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

// Serviço sem profissional vinculado sai do catálogo: o cliente não pode
// escolher um caminho sem horário possível.
export function toPublicBusinessDto(
  business: { name: string; slug: string },
  services: CatalogService[],
): PublicBusinessDto {
  return {
    business: { name: business.name, slug: business.slug },
    services: services
      .filter((service) => service.employees.length > 0)
      .map((service) => ({
        id: service.id,
        name: service.name,
        duration: service.duration,
        price: service.price.toString(),
        employees: service.employees,
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
