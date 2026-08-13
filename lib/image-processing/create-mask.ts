import sharp from "sharp";
import type { ImageBoundingBox } from "./types";

export type MaskPaddingOptions = {
  /** Minimum padding in pixels. Default 5. */
  minPx?: number;
  /** Maximum padding in pixels. Default 15. */
  maxPx?: number;
  /** Padding as fraction of the smaller logo dimension. Default 0.08. */
  ratio?: number;
};

/** Expand bounding box with proportional padding, clamped to image bounds. */
export function expandBoundingBoxWithPadding(
  box: ImageBoundingBox,
  imageWidth: number,
  imageHeight: number,
  options: MaskPaddingOptions = {}
): ImageBoundingBox {
  const minPx = options.minPx ?? 5;
  const maxPx = options.maxPx ?? 15;
  const ratio = options.ratio ?? 0.08;

  const logoMinDim = Math.min(box.width, box.height);
  const padding = Math.max(minPx, Math.min(maxPx, Math.round(logoMinDim * ratio)));

  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const right = Math.min(imageWidth, box.x + box.width + padding);
  const bottom = Math.min(imageHeight, box.y + box.height + padding);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

/**
 * Create a single-channel PNG mask (white = logo region, black = preserve).
 * Output matches source image dimensions.
 */
export async function createLogoMask(
  imageWidth: number,
  imageHeight: number,
  boundingBox: ImageBoundingBox,
  options: MaskPaddingOptions = {}
): Promise<Buffer> {
  const padded = expandBoundingBoxWithPadding(
    boundingBox,
    imageWidth,
    imageHeight,
    options
  );

  const maskBase = Buffer.alloc(imageWidth * imageHeight, 0);
  for (let y = padded.y; y < padded.y + padded.height; y += 1) {
    for (let x = padded.x; x < padded.x + padded.width; x += 1) {
      maskBase[y * imageWidth + x] = 255;
    }
  }

  return sharp(maskBase, {
    raw: { width: imageWidth, height: imageHeight, channels: 1 },
  })
    .png()
    .toBuffer();
}
