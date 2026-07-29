import assert from "node:assert/strict";
import { test } from "node:test";
import { IMAGE_PRESETS, coverCrop } from "./image.ts";

// Origem mais larga que o destino: corta nas laterais, mantém a altura toda.
test("coverCrop corta as laterais de uma imagem panorâmica", () => {
  const crop = coverCrop({ width: 2000, height: 1000 }, { width: 400, height: 400 });

  assert.deepEqual(crop, { sx: 500, sy: 0, sWidth: 1000, sHeight: 1000 });
});

// Origem mais alta: corta em cima e embaixo, mantém a largura toda.
test("coverCrop corta o topo e o pé de uma imagem vertical", () => {
  const crop = coverCrop({ width: 1000, height: 2000 }, { width: 400, height: 400 });

  assert.deepEqual(crop, { sx: 0, sy: 500, sWidth: 1000, sHeight: 1000 });
});

test("coverCrop não corta nada quando a proporção já bate", () => {
  const crop = coverCrop({ width: 1600, height: 600 }, IMAGE_PRESETS.banner);

  assert.deepEqual(crop, { sx: 0, sy: 0, sWidth: 1600, sHeight: 600 });
});

test("os presets são os combinados na spec", () => {
  assert.deepEqual(IMAGE_PRESETS, {
    logo: { width: 512, height: 512 },
    avatar: { width: 400, height: 400 },
    banner: { width: 1600, height: 600 },
  });
});
