import { ImagePreset, coverCrop } from "./image.ts";

// Sem teste em Node: canvas e createImageBitmap só existem no browser. A
// parte que tem regra — o recorte — mora em image.ts, que é testada.
export async function resizeToWebp(file: File, preset: ImagePreset): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = preset.width;
    canvas.height = preset.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Não foi possível processar a imagem neste navegador.");
    }

    const { sx, sy, sWidth, sHeight } = coverCrop(
      { width: bitmap.width, height: bitmap.height },
      preset,
    );
    context.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, preset.width, preset.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob) {
      throw new Error("Não foi possível processar a imagem neste navegador.");
    }

    return blob;
  } finally {
    bitmap.close();
  }
}
