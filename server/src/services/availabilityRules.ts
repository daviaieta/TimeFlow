import { Role } from "@prisma/client";

export interface AvailabilityInput {
  date: string;
  startTime: string;
  endTime: string;
}

export interface AvailabilityData {
  date: Date;
  startTime: string;
  endTime: string;
}

export interface BookingSummary {
  id: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  service: { id: number; name: string };
  // client* acima continuam sendo o retrato do que foi digitado no ato (§15
  // armadilha 5) — o prontuário ao lado é o cadastro vivo, que pode ter sido
  // corrigido depois. São coisas diferentes de propósito: a agenda mostra o
  // primeiro e linka para o segundo.
  profile: { publicId: string; displayName: string } | null;
}

export interface AvailabilityRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  booking: BookingSummary | null;
}

export interface AvailabilityDto {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  booking: BookingSummary | null;
}

// O booking sai inteiro, e não achatado num clientName: uma reserva mais longa
// que o slot ocupa vários slots seguidos, e é o `booking.id` repetido que deixa
// a timeline colapsar todos eles num evento só.
export function toAvailabilityDto(row: AvailabilityRow): AvailabilityDto {
  return {
    id: row.id,
    date: row.date.toISOString(),
    startTime: row.startTime,
    endTime: row.endTime,
    isBooked: row.isBooked,
    booking: row.booking,
  };
}

// "Hoje" no fuso do servidor: mesma convenção que generateAvailabilities já usa
// para montar Date a partir de "YYYY-MM-DDT00:00:00.000Z". O `date` gravado
// é sempre meia-noite UTC do dia — comparar direto contra `new Date()` sem
// zerar a hora daria "hoje" errado a qualquer hora depois das 00:00 UTC.
export function utcMidnight(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

// "Hoje" pro corte Próximos/Passados usa o fuso do negócio, não o do
// servidor: `date` é sempre meia-noite UTC (um marcador de dia, não um
// instante), mas o servidor roda em UTC enquanto o negócio opera em
// America/Sao_Paulo. Usar utcMidnight(now) direto faz o dia virar às 21h
// local (00h UTC), sumindo "hoje" da aba Próximos horas antes da meia-noite
// real do dono do negócio.
export function businessToday(now: Date): Date {
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(now);
  return new Date(`${isoDate}T00:00:00.000Z`);
}

// "YYYY-MM-DD" pro dia que a agenda abre por padrão, no fuso do negócio.
export function businessDayKey(now: Date): string {
  return businessToday(now).toISOString().slice(0, 10);
}

// O `date` gravado é meia-noite UTC — um marcador de dia, não um instante.
// Comparar com qualquer outra hora erraria o dia.
export function dayKeyToDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

export type ScheduleTarget =
  | { allowed: true; employeeId: number }
  | { allowed: false; reason: "employee-id-required" | "forbidden" };

// De quem é a agenda que o ator pode abrir. EMPLOYEE enxerga só a própria:
// sem employeeId cai nela, e pedir a de um colega é negado — a agenda é onde
// se registram os horários de trabalho, e ninguém registra os do outro.
// ADMIN não tem agenda própria, então precisa sempre dizer de quem quer ver.
export function resolveScheduleTarget(
  actor: { sub: number; role: Role },
  employeeIdParam: number | undefined,
): ScheduleTarget {
  if (actor.role === Role.EMPLOYEE) {
    if (employeeIdParam === undefined || employeeIdParam === actor.sub) {
      return { allowed: true, employeeId: actor.sub };
    }
    return { allowed: false, reason: "forbidden" };
  }

  if (employeeIdParam === undefined) {
    return { allowed: false, reason: "employee-id-required" };
  }

  return { allowed: true, employeeId: employeeIdParam };
}
