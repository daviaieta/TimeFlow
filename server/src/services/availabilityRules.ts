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

export interface AvailabilityRow {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  booking: { id: number; clientName: string } | null;
}

export interface AvailabilityDto {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  clientName: string | null;
}

export function toAvailabilityDto(row: AvailabilityRow): AvailabilityDto {
  return {
    id: row.id,
    date: row.date.toISOString(),
    startTime: row.startTime,
    endTime: row.endTime,
    isBooked: row.isBooked,
    clientName: row.booking?.clientName ?? null,
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

export function totalPagesFor(totalDays: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalDays / pageSize));
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages);
}
