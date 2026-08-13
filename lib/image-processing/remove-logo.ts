import sharp from "sharp";
import { inpaintMaskedRegion } from "./inpaint";
import type { ImageBoundingBox } from "./types";

export type LogoRemovalResult =
  | {
      success: true;
      buffer: Buffer;
      method: string;
    }
  | {
      success: false;
      error: string;
    };

async function encodeInpaintedBuffer(
  pixels: Uint8Array,
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp"
): Promise<Buffer> {
  let pipeline = sharp(pixels, {
    raw: { width, height, channels: 3 },
  });

  if (format === "png") {
    pipeline = pipeline.png();
  } else if (format === "webp") {
    pipeline = pipeline.webp({ quality: 92 });
  } else {
    pipeline = pipeline.jpeg({ quality: 92 });
  }

  return pipeline.toBuffer();
}

function toRgbPixels(data: Buffer, width: number, height: number, channels: number): Uint8Array {
  if (channels === 3) {
    return new Uint8Array(data);
  }

  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return rgb;
}

/**
 * Remove logo region via mask-guided inpainting (TELEA-style fill using sharp).
 * Original buffer is never mutated.
 */
export async function removeLogo(
  originalBuffer: Buffer,
  maskBuffer: Buffer,
  boundingBox: ImageBoundingBox
): Promise<LogoRemovalResult> {
  void boundingBox;

  try {
    const image = sharp(originalBuffer, { failOn: "none" });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return { success: false, error: "Unable to decode image for inpainting." };
    }

    const width = metadata.width;
    const height = metadata.height;
    const format =
      metadata.format === "png" || metadata.format === "webp"
        ? metadata.format
        : "jpeg";

    const { data, info } = await image
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const maskRaw = await sharp(maskBuffer)
      .grayscale()
      .resize(width, height, { fit: "fill" })
      .raw()
      .toBuffer();

    const sourcePixels = toRgbPixels(data, width, height, info.channels);

    const { output, unfilledPixels } = inpaintMaskedRegion(
      sourcePixels,
      new Uint8Array(maskRaw),
      width,
      height,
      3
    );

    if (unfilledPixels > 0) {
      return {
        success: false,
        error: `Inpainting incomplete — ${unfilledPixels} masked pixels could not be filled.`,
      };
    }

    const buffer = await encodeInpaintedBuffer(output, width, height, format);
    return { success: true, buffer, method: "telea-inpaint-sharp" };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Logo inpainting failed.",
    };
  }
}
