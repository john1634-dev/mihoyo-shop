import type { ProductImagePipelineFields } from "../supplier/types";

export type ImageBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageDetectionResult = {
  detected: boolean;
  confidence: number;
  boundingBox: ImageBoundingBox | null;
  reason: string;
  /** True when confidence is between review and auto thresholds. */
  reviewRequired?: boolean;
  /** Template scale that produced the best match. */
  scale?: number;
};

export type ImageProcessingStatus = NonNullable<
  ProductImagePipelineFields["processing_status"]
>;

export type DecodedImage = {
  buffer: Buffer;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
};

export type ImageProcessingResult = {
  source: string;
  imageUrl: string;
  originalBuffer: Buffer;
  processedBuffer: Buffer | null;
  maskBuffer: Buffer | null;
  detection: ImageDetectionResult;
  processingStatus: ImageProcessingStatus;
  processingError: string | null;
  width: number;
  height: number;
  format: DecodedImage["format"];
};

/** >= auto: eligible for automatic logo removal. */
export const LOGO_CONFIDENCE_AUTO = 0.8;

/** >= review: detection flagged for manual review. */
export const LOGO_CONFIDENCE_REVIEW = 0.7;

export const LOGO_DETECTION_SCALES = [
  0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 1.75, 2,
] as const;

/** Extra scales around the best coarse match (JPEG watermarks are often between coarse steps). */
export const LOGO_SCALE_REFINE_MULTIPLIERS = [
  0.88, 0.92, 0.96, 1.04, 1.08, 1.12, 1.16,
] as const;

export const ZINKGAME_LOGO_TEMPLATE_RELATIVE =
  "assets/zinkgame/zinkgame-logo-template.png";
