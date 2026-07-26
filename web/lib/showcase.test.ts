import assert from "node:assert/strict";
import { test } from "node:test";
import { businessGradient, servicesByEmployee } from "./showcase.ts";
import { type PublicService } from "./publicBooking.ts";

test("o mesmo slug devolve sempre o mesmo gradiente", () => {
  assert.deepEqual(
    businessGradient("barbearia-old-brothers"),
    businessGradient("barbearia-old-brothers"),
  );
});

test("slugs diferentes recebem cores diferentes", () => {
  const um = businessGradient("barbearia-old-brothers");
  const outro = businessGradient("studio-bella");

  assert.notEqual(um.from, outro.from);
});

test("o gradiente sai em HSL válido", () => {
  const { from, to } = businessGradient("qualquer-coisa");

  assert.match(from, /^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/);
  assert.match(to, /^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/);
});

test("slug vazio não quebra o gradiente", () => {
  const { from } = businessGradient("");

  assert.match(from, /^hsl\(/);
});

function service(
  id: number,
  name: string,
  employees: { id: number; name: string }[],
): PublicService {
  return {
    id,
    name,
    duration: 30,
    price: "45.00",
    employees: employees.map((employee) => ({ ...employee, nextSlot: null })),
  };
}

test("cada profissional lista os serviços que atende", () => {
  const map = servicesByEmployee([
    service(1, "Corte", [
      { id: 10, name: "Ana" },
      { id: 11, name: "Bruno" },
    ]),
    service(2, "Barba", [{ id: 11, name: "Bruno" }]),
  ]);

  assert.deepEqual(map.get(10), ["Corte"]);
  assert.deepEqual(map.get(11), ["Corte", "Barba"]);
});

test("profissional sem serviço não aparece no mapa", () => {
  const map = servicesByEmployee([service(1, "Corte", [{ id: 10, name: "Ana" }])]);

  assert.equal(map.has(99), false);
});

test("catálogo vazio devolve mapa vazio", () => {
  assert.equal(servicesByEmployee([]).size, 0);
});
