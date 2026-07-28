import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimiter, isRateLimited, withinWindow } from "./rateLimit";

const HOUR = 60 * 60 * 1000;

test("withinWindow descarta o que é mais velho que a janela", () => {
  const now = 10 * HOUR;
  const timestamps = [now - 2 * HOUR, now - 30 * 60 * 1000, now];

  assert.deepEqual(withinWindow(timestamps, now, HOUR), [
    now - 30 * 60 * 1000,
    now,
  ]);
});

test("isRateLimited só bloqueia ao atingir o máximo dentro da janela", () => {
  const now = 10 * HOUR;
  const options = { windowMs: HOUR, max: 3 };

  assert.equal(isRateLimited([now, now], now, options), false);
  assert.equal(isRateLimited([now, now, now], now, options), true);
  // Três envios, mas velhos: a janela já passou, não bloqueia.
  const old = now - 2 * HOUR;
  assert.equal(isRateLimited([old, old, old], now, options), false);
});

test("o limiter libera até o máximo e bloqueia o seguinte", () => {
  const limiter = createRateLimiter({ windowMs: HOUR, max: 2 });
  const now = 10 * HOUR;

  assert.equal(limiter.hit("ip-a", now), false);
  assert.equal(limiter.hit("ip-a", now), false);
  assert.equal(limiter.hit("ip-a", now), true);
});

test("chaves diferentes não compartilham o limite", () => {
  const limiter = createRateLimiter({ windowMs: HOUR, max: 1 });
  const now = 10 * HOUR;

  assert.equal(limiter.hit("ip-a", now), false);
  assert.equal(limiter.hit("ip-b", now), false);
  assert.equal(limiter.hit("ip-a", now), true);
});

test("a janela abre de novo quando o tempo passa", () => {
  const limiter = createRateLimiter({ windowMs: HOUR, max: 1 });
  const now = 10 * HOUR;

  assert.equal(limiter.hit("ip-a", now), false);
  assert.equal(limiter.hit("ip-a", now + HOUR + 1), false);
});

// A chamada bloqueada não pode ser registrada: se fosse, quem insiste
// empurraria a própria janela para frente e ficaria travado para sempre.
test("a tentativa bloqueada não estende a punição", () => {
  const limiter = createRateLimiter({ windowMs: HOUR, max: 1 });
  const now = 10 * HOUR;

  assert.equal(limiter.hit("ip-a", now), false);
  assert.equal(limiter.hit("ip-a", now + 1), true);
  assert.equal(limiter.hit("ip-a", now + 2), true);
  // Uma hora depois do ÚNICO acerto registrado, e não da última tentativa.
  assert.equal(limiter.hit("ip-a", now + HOUR + 1), false);
});

// Regressão: sem a poda, todo IP que passou por aqui uma vez ficaria no mapa
// pela vida do processo.
test("chaves com a janela vencida saem do mapa", () => {
  const limiter = createRateLimiter({ windowMs: HOUR, max: 1 });
  const now = 10 * HOUR;

  limiter.hit("antigo", now);
  // Uma chamada de outra chave, muito depois, é o que dispara a varredura.
  limiter.hit("novo", now + 2 * HOUR);

  const internals = limiter as unknown as { hitsByKey?: Map<string, number[]> };
  // O mapa é privado ao closure; o que dá para observar de fora é o efeito:
  // a chave antiga não carrega mais histórico e volta a ser aceita.
  assert.equal(internals.hitsByKey, undefined);
  assert.equal(limiter.hit("antigo", now + 2 * HOUR), false);
});
