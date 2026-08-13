/**
 * Fast-marching style inpainting from known border pixels into masked regions.
 * Similar in spirit to OpenCV TELEA — fills logo areas from neighboring pixels.
 */
export function inpaintMaskedRegion(
  pixels: Uint8Array,
  mask: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4 = 3
): { output: Uint8Array; unfilledPixels: number } {
  if (pixels.length !== width * height * channels) {
    throw new Error("Pixel buffer size does not match dimensions.");
  }
  if (mask.length !== width * height) {
    throw new Error("Mask size does not match dimensions.");
  }

  const output = new Uint8Array(pixels);
  const toFill = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    toFill[i] = mask[i] > 127 ? 1 : 0;
  }

  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;

  const maxPasses = width + height;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let filledAny = false;
    const next = new Uint8Array(toFill);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (toFill[idx] === 0) continue;

        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let count = 0;

        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

          const neighborIdx = ny * width + nx;
          if (toFill[neighborIdx] !== 0) continue;

          const pixelOffset = neighborIdx * channels;
          sumR += output[pixelOffset];
          sumG += output[pixelOffset + 1];
          sumB += output[pixelOffset + 2];
          count += 1;
        }

        if (count > 0) {
          const pixelOffset = idx * channels;
          output[pixelOffset] = Math.round(sumR / count);
          output[pixelOffset + 1] = Math.round(sumG / count);
          output[pixelOffset + 2] = Math.round(sumB / count);
          next[idx] = 0;
          filledAny = true;
        }
      }
    }

    toFill.set(next);
    if (!filledAny) break;
  }

  let unfilledPixels = 0;
  for (let i = 0; i < toFill.length; i += 1) {
    if (toFill[i] !== 0) unfilledPixels += 1;
  }

  return { output, unfilledPixels };
}

export function countMaskedPixels(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] > 127) count += 1;
  }
  return count;
}
