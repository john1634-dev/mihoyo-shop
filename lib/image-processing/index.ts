import "server-only";

import sharp from "sharp";
import { createLogoMask } from "./create-mask";
import { detectZinkGameLogo } from "./detect-logo";
import { downloadSupplierImage } from "./download";
import { removeLogo } from "./remove-logo";
import type {
  DecodedImage,
  ImageProcessingResult,
  ImageProcessingStatus,
} from "./types";
import {
  LOGO_CONFIDENCE_AUTO,
  LOGO_CONFIDENCE_REVIEW,
} from "./types";

export type ProcessSupplierImageInput = {
  imageUrl: string;
  source: string;
  /** Skip network fetch — for local tests only. */
  buffer?: Buffer;
};

async function decodeImageBuffer(buffer: Buffer): Promise<DecodedImage> {
  const image = sharp(buffer, { failOn: "none" });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to decode image dimensions.");
  }

  const format = metadata.format;
  if (format !== "jpeg" && format !== "png" && format !== "webp") {
    throw new Error(`Unsupported image format: ${format ?? "unknown"}.`);
  }

  return {
    buffer,
    width: metadata.width,
    height: metadata.height,
    format,
  };
}

/**
 * Fetch → detect → mask → (inpaint when available).
 * Does not write to database or storage.
 */
export async function processSupplierImage(
  input: ProcessSupplierImageInput
): Promise<ImageProcessingResult> {
  const source = input.source.trim().toLowerCase();
  const imageUrl = input.imageUrl.trim();

  let originalBuffer: Buffer;
  if (input.buffer) {
    originalBuffer = input.buffer;
  } else {
    const downloaded = await downloadSupplierImage(source, imageUrl);
    originalBuffer = downloaded.buffer;
  }

  const decoded = await decodeImageBuffer(originalBuffer);
  const detection = await detectZinkGameLogo(decoded.buffer);

  let processingStatus: ImageProcessingStatus = "processing";
  let processingError: string | null = null;
  let maskBuffer: Buffer | null = null;
  let processedBuffer: Buffer | null = null;

  if (detection.reason.includes("No logo template available")) {
    processingStatus = "skipped";
    processingError = null;
  } else if (!detection.detected || detection.confidence < LOGO_CONFIDENCE_REVIEW) {
    processingStatus = "skipped";
  } else if (detection.boundingBox) {
    maskBuffer = await createLogoMask(
      decoded.width,
      decoded.height,
      detection.boundingBox
    );

    if (detection.reviewRequired) {
      processingStatus = "skipped";
      processingError = "Detection needs manual review before removal.";
    } else if (detection.confidence >= LOGO_CONFIDENCE_AUTO) {
      const removal = await removeLogo(
        decoded.buffer,
        maskBuffer,
        detection.boundingBox
      );

      if (removal.success) {
        processedBuffer = removal.buffer;
        processingStatus = "completed";
      } else {
        processingStatus = "failed";
        processingError = removal.error;
      }
    } else {
      processingStatus = "skipped";
    }
  } else {
    processingStatus = "skipped";
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[image-processing:result]", {
      source,
      imageUrl,
      width: decoded.width,
      height: decoded.height,
      detected: detection.detected,
      confidence: detection.confidence,
      processingStatus,
    });
  }

  return {
    source,
    imageUrl,
    originalBuffer: decoded.buffer,
    processedBuffer,
    maskBuffer,
    detection,
    processingStatus,
    processingError,
    width: decoded.width,
    height: decoded.height,
    format: decoded.format,
  };
}

export {
  detectZinkGameLogo,
  getZinkGameLogoTemplatePath,
  loadZinkGameLogoTemplate,
} from "./detect-logo";
export { createLogoMask, expandBoundingBoxWithPadding } from "./create-mask";
export { inpaintMaskedRegion, countMaskedPixels } from "./inpaint";
export { removeLogo } from "./remove-logo";
export {
  downloadSupplierImage,
  isAllowedSupplierImageUrl,
  ImageDownloadError,
} from "./download";
export type {
  ImageBoundingBox,
  ImageDetectionResult,
  ImageProcessingResult,
  ImageProcessingStatus,
} from "./types";
export {
  LOGO_CONFIDENCE_AUTO,
  LOGO_CONFIDENCE_REVIEW,
  LOGO_DETECTION_SCALES,
  LOGO_SCALE_REFINE_MULTIPLIERS,
  ZINKGAME_LOGO_TEMPLATE_RELATIVE,
} from "./types";
