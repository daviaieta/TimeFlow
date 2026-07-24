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
  booking: { id: number } | null;
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
    clientName: row.clientName,
    locked: row.booking !== null,
  };
}
