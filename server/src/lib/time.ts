// Horários circulam como "HH:mm" em todo o domínio de agenda. A aritmética
// mora aqui para o gerador de slots e as regras de reserva contarem minutos
// do mesmo jeito.
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function toTime(total: number): string {
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}
