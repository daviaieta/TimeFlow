import { type PublicService } from "./publicBooking.ts";

export interface BusinessGradient {
  from: string;
  to: string;
}

// djb2: curto e espalha bem. O importante é ser estável — o mesmo negócio
// precisa ter sempre a mesma cara, e dois negócios precisam se distinguir.
function hashSlug(slug: string): number {
  let value = 5381;

  for (let index = 0; index < slug.length; index += 1) {
    value = (value * 33) ^ slug.charCodeAt(index);
  }

  return Math.abs(value);
}

// Nenhum negócio tem banner cadastrado ainda. Em vez de um bloco cinza, cada
// slug ganha seu próprio par de cores, derivado dele mesmo.
export function businessGradient(slug: string): BusinessGradient {
  const hue = hashSlug(slug) % 360;
  // 40° na roda de cores: perto o bastante para o gradiente ler como uma cor
  // só, longe o bastante para não virar um bloco chapado.
  const partner = (hue + 40) % 360;

  return {
    from: `hsl(${hue} 62% 42%)`,
    to: `hsl(${partner} 68% 28%)`,
  };
}

// A API entrega serviço → profissionais. A seção de equipe precisa do inverso,
// e inverter aqui evita um request a mais só para montar a lista.
export function servicesByEmployee(
  services: PublicService[],
): Map<number, string[]> {
  const byEmployee = new Map<number, string[]>();

  for (const service of services) {
    for (const employee of service.employees) {
      const owned = byEmployee.get(employee.id) ?? [];
      owned.push(service.name);
      byEmployee.set(employee.id, owned);
    }
  }

  return byEmployee;
}
