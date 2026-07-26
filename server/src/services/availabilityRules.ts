export interface AvailabilityInput {
  date: string;
  startTime: string;
  endTime: string;
  clientName?: string | null;
}

export interface AvailabilityData {
  date: Date;
  startTime: string;
  endTime: string;
  clientName: string | null;
  isBooked: boolean;
}

export interface AvailabilityRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
  booking: { id: number; clientName: string } | null;
}

export interface AvailabilityDto {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
  locked: boolean;
}

export function normalizeClientName(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Um horário só é "ocupado" quando tem alguém associado — não existe slot
// marcado sem nome.
export function buildAvailabilityData(input: AvailabilityInput): AvailabilityData {
  const clientName = normalizeClientName(input.clientName);

  return {
    date: new Date(input.date),
    startTime: input.startTime,
    endTime: input.endTime,
    clientName,
    isBooked: clientName !== null,
  };
}

// locked = reserva feita por cliente externo. Encaixe manual (nome sem Booking)
// continua sob controle do colaborador.
export function toAvailabilityDto(row: AvailabilityRow): AvailabilityDto {
  return {
    id: row.id,
    date: row.date.toISOString(),
    startTime: row.startTime,
    endTime: row.endTime,
    isBooked: row.isBooked,
    // O encaixe manual tem precedência: se o colaborador anotou um nome, é o
    // dele que ele espera ver. Sem anotação, cai no nome de quem reservou.
    clientName: row.clientName ?? row.booking?.clientName ?? null,
    locked: row.booking !== null,
  };
}

// "Hoje" no fuso do servidor: mesma convenção que generateAvailabilities já usa
// para montar Date a partir de "YYYY-MM-DDT00:00:00.000Z". O `date` gravado
// é sempre meia-noite UTC do dia — comparar direto contra `new Date()` sem
// zerar a hora daria "hoje" errado a qualquer hora depois das 00:00 UTC.
export function utcMidnight(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function totalPagesFor(totalDays: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalDays / pageSize));
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages);
}
