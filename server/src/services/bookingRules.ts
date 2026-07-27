import { toMinutes, toTime } from "../lib/time";

export function normalizeClientName(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

export interface DurationSlot {
  id: number;
  date: Date;
  startTime: string;
  endTime: string;
}

export interface EmployeeSlot extends DurationSlot {
  employeeId: number;
}

export interface NextSlot {
  date: string;
  startTime: string;
}

// Próxima vaga de cada profissional em que um serviço de `durationMinutes`
// cabe inteiro. Duração 0 = "qualquer horário livre", que é o que o card do
// profissional mostra enquanto o cliente ainda não escolheu o serviço.
//
// Slots chegam ordenados por data/hora; quem não tem vaga à frente fica fora
// do mapa e a tela mostra "sem vagas".
export function nextSlotPerEmployee(
  slots: EmployeeSlot[],
  durationMinutes: number,
  now: Date,
): Map<number, NextSlot> {
  const byEmployee = new Map<number, EmployeeSlot[]>();

  for (const slot of slots) {
    if (!isSlotUpcoming(slot, now)) continue;
    const own = byEmployee.get(slot.employeeId) ?? [];
    own.push(slot);
    byEmployee.set(slot.employeeId, own);
  }

  const map = new Map<number, NextSlot>();

  for (const [employeeId, own] of byEmployee) {
    const first = own.find(
      (slot) => slotRunForDuration(own, slot.id, durationMinutes) !== null,
    );
    if (!first) continue;

    map.set(employeeId, {
      date: first.date.toISOString(),
      startTime: first.startTime,
    });
  }

  return map;
}

export function serviceEndTime(startTime: string, durationMinutes: number): string {
  return toTime(toMinutes(startTime) + durationMinutes);
}

// A grade do colaborador é fixa, mas o serviço tem a duração que tem: um
// atendimento mais longo que o slot avança sobre os seguintes. O run só existe
// se esses vizinhos estiverem livres, colados e no mesmo dia — e sobra da
// grade é perdida, porque ninguém é atendido nos minutos que restam.
//
// `slots` precisa vir ordenado por data/hora e conter apenas horários livres:
// um slot reservado simplesmente não está na lista, e o run morre no buraco.
export function slotRunForDuration<T extends DurationSlot>(
  slots: T[],
  startSlotId: number,
  durationMinutes: number,
): T[] | null {
  const index = slots.findIndex((slot) => slot.id === startSlotId);
  if (index === -1) return null;

  const first = slots[index];
  const target = toMinutes(first.startTime) + durationMinutes;

  const run: T[] = [];
  let covered = toMinutes(first.startTime);

  for (let cursor = index; cursor < slots.length; cursor += 1) {
    const slot = slots[cursor];

    if (slot.date.getTime() !== first.date.getTime()) break;
    if (toMinutes(slot.startTime) !== covered) break; // buraco na grade

    run.push(slot);
    covered = toMinutes(slot.endTime);

    if (covered >= target) return run;
  }

  return null;
}

// O cliente só enxerga horários em que o serviço cabe inteiro — é o que
// impede marcar 09:00 de descoloração com a barba das 09:30 já reservada.
export function slotsFittingDuration<T extends DurationSlot>(
  slots: T[],
  durationMinutes: number,
): T[] {
  return slots.filter(
    (slot) => slotRunForDuration(slots, slot.id, durationMinutes) !== null,
  );
}
