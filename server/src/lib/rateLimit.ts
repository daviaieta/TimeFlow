export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function withinWindow(
  timestamps: number[],
  now: number,
  windowMs: number,
): number[] {
  return timestamps.filter((timestamp) => now - timestamp < windowMs);
}

export function isRateLimited(
  timestamps: number[],
  now: number,
  options: RateLimitOptions,
): boolean {
  return withinWindow(timestamps, now, options.windowMs).length >= options.max;
}

export interface RateLimiter {
  /** true quando a chamada estourou o limite — nesse caso ela não é contada. */
  hit(key: string, now: number): boolean;
}

// Em memória de propósito: para o volume atual não vale um Redis, e reiniciar
// o processo zerar a janela é aceitável.
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const hitsByKey = new Map<string, number[]>();

  return {
    hit(key, now) {
      // Varre o mapa inteiro e remove as chaves cuja janela zerou: sem isso,
      // toda chave distinta que já bateu aqui uma vez fica presa no Map pela
      // vida do processo, e ele cresce sem limite.
      for (const [otherKey, timestamps] of hitsByKey) {
        if (otherKey === key) continue;
        const pruned = withinWindow(timestamps, now, options.windowMs);
        if (pruned.length === 0) {
          hitsByKey.delete(otherKey);
        } else {
          hitsByKey.set(otherKey, pruned);
        }
      }

      const previous = hitsByKey.get(key) ?? [];
      if (isRateLimited(previous, now, options)) {
        return true;
      }

      hitsByKey.set(key, [...withinWindow(previous, now, options.windowMs), now]);
      return false;
    },
  };
}
