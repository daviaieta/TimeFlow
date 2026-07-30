export interface ImagePreset {
  width: number;
  height: number;
}

export const IMAGE_PRESETS = {
  logo: { width: 512, height: 512 },
  avatar: { width: 400, height: 400 },
  banner: { width: 1600, height: 600 },
} as const satisfies Record<string, ImagePreset>;

export interface CropBox {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

// "cover": preenche o destino inteiro e descarta a sobra, centralizada. O
// contrário ("contain") deixaria tarja no card, que é pior do que perder um
// pedaço da borda numa foto de perfil.
export function coverCrop(
  source: { width: number; height: number },
  target: ImagePreset,
): CropBox {
  const sourceRatio = source.width / source.height;
  const targetRatio = target.width / target.height;

  if (sourceRatio > targetRatio) {
    const sWidth = Math.round(source.height * targetRatio);
    return {
      sx: Math.round((source.width - sWidth) / 2),
      sy: 0,
      sWidth,
      sHeight: source.height,
    };
  }

  const sHeight = Math.round(source.width / targetRatio);
  return {
    sx: 0,
    sy: Math.round((source.height - sHeight) / 2),
    sWidth: source.width,
    sHeight,
  };
}
