import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { ImageBoundingBox, ImageDetectionResult } from "./types";
import {
  LOGO_CONFIDENCE_AUTO,
  LOGO_CONFIDENCE_REVIEW,
  LOGO_DETECTION_SCALES,
  LOGO_SCALE_REFINE_MULTIPLIERS,
  ZINKGAME_LOGO_TEMPLATE_RELATIVE,
} from "./types";

type GrayscaleImage = {
  data: Float32Array;
  width: number;
  height: number;
};

export function getZinkGameLogoTemplatePath(): string {
  return join(process.cwd(), ...ZINKGAME_LOGO_TEMPLATE_RELATIVE.split("/"));
}

export async function loadZinkGameLogoTemplate(): Promise<Buffer | null> {
  const templatePath = getZinkGameLogoTemplatePath();
  if (!existsSync(templatePath)) return null;
  return readFile(templatePath);
}

async function decodeGrayscale(buffer: Buffer): Promise<GrayscaleImage> {
  const { data, info } = await sharp(buffer)
    .grayscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Float32Array(info.width * info.height);
  for (let i = 0; i < pixels.length; i += 1) {
    pixels[i] = data[i] / 255;
  }

  return { data: pixels, width: info.width, height: info.height };
}

async function decodeTemplateAtScale(
  templateBuffer: Buffer,
  scale: number
): Promise<GrayscaleImage> {
  let pipeline = sharp(templateBuffer)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .removeAlpha();
  if (scale !== 1) {
    const meta = await sharp(templateBuffer).metadata();
    const width = Math.max(1, Math.round((meta.width ?? 1) * scale));
    const height = Math.max(1, Math.round((meta.height ?? 1) * scale));
    pipeline = pipeline.resize(width, height, { fit: "fill" });
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const pixels = new Float32Array(info.width * info.height);
  for (let i = 0; i < pixels.length; i += 1) {
    pixels[i] = data[i] / 255;
  }

  return { data: pixels, width: info.width, height: info.height };
}

function computeNccAt(
  image: GrayscaleImage,
  template: GrayscaleImage,
  offsetX: number,
  offsetY: number
): number {
  const { width: tplW, height: tplH, data: tpl } = template;
  const { width: imgW, data: img } = image;

  let sumImg = 0;
  let sumTpl = 0;
  let sumImgSq = 0;
  let sumTplSq = 0;
  let sumCross = 0;
  const count = tplW * tplH;

  for (let y = 0; y < tplH; y += 1) {
    const imgRow = (offsetY + y) * imgW;
    const tplRow = y * tplW;
    for (let x = 0; x < tplW; x += 1) {
      const imgVal = img[imgRow + offsetX + x];
      const tplVal = tpl[tplRow + x];
      sumImg += imgVal;
      sumTpl += tplVal;
      sumImgSq += imgVal * imgVal;
      sumTplSq += tplVal * tplVal;
      sumCross += imgVal * tplVal;
    }
  }

  const meanImg = sumImg / count;
  const meanTpl = sumTpl / count;
  const varImg = sumImgSq / count - meanImg * meanImg;
  const varTpl = sumTplSq / count - meanTpl * meanTpl;

  if (varImg <= 1e-8 || varTpl <= 1e-8) return -1;

  const covariance = sumCross / count - meanImg * meanTpl;
  return covariance / Math.sqrt(varImg * varTpl);
}

function matchTemplateAtScale(
  image: GrayscaleImage,
  template: GrayscaleImage,
  scale: number
): { score: number; box: ImageBoundingBox; scale: number; step: number } | null {
  if (template.width > image.width || template.height > image.height) {
    return null;
  }

  const step = Math.max(1, Math.round(Math.min(template.width, template.height) / 8));
  let bestScore = -1;
  let bestBox: ImageBoundingBox | null = null;

  const maxX = image.width - template.width;
  const maxY = image.height - template.height;

  for (let y = 0; y <= maxY; y += step) {
    for (let x = 0; x <= maxX; x += step) {
      const score = computeNccAt(image, template, x, y);
      if (score > bestScore) {
        bestScore = score;
        bestBox = {
          x,
          y,
          width: template.width,
          height: template.height,
        };
      }
    }
  }

  if (!bestBox || bestScore < 0) return null;

  return { score: bestScore, box: bestBox, scale, step };
}

function refineMatchLocally(
  image: GrayscaleImage,
  template: GrayscaleImage,
  initial: ImageBoundingBox,
  radius: number
): { score: number; box: ImageBoundingBox } {
  let bestScore = -1;
  let bestBox = initial;

  const minX = Math.max(0, initial.x - radius);
  const minY = Math.max(0, initial.y - radius);
  const maxX = Math.min(image.width - template.width, initial.x + radius);
  const maxY = Math.min(image.height - template.height, initial.y + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const score = computeNccAt(image, template, x, y);
      if (score > bestScore) {
        bestScore = score;
        bestBox = {
          x,
          y,
          width: template.width,
          height: template.height,
        };
      }
    }
  }

  return { score: bestScore, box: bestBox };
}

type LogoMatch = {
  score: number;
  box: ImageBoundingBox;
  scale: number;
  template: GrayscaleImage;
};

async function matchAtScale(
  image: GrayscaleImage,
  templateBuffer: Buffer,
  scale: number
): Promise<LogoMatch | null> {
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const scaledTemplate = await decodeTemplateAtScale(templateBuffer, scale);
  const match = matchTemplateAtScale(image, scaledTemplate, scale);
  if (!match) return null;

  const refined = refineMatchLocally(
    image,
    scaledTemplate,
    match.box,
    Math.max(4, match.step)
  );

  return {
    score: refined.score,
    box: refined.box,
    scale,
    template: scaledTemplate,
  };
}

export type DetectLogoOptions = {
  templateBuffer?: Buffer | null;
  scales?: readonly number[];
};

/**
 * ZinkGame logo detector — normalized cross-correlation template matching
 * at multiple scales. Requires an authorized logo template PNG.
 */
export async function detectZinkGameLogo(
  imageBuffer: Buffer,
  options: DetectLogoOptions = {}
): Promise<ImageDetectionResult> {
  const loadedTemplate =
    options.templateBuffer ?? (await loadZinkGameLogoTemplate());

  if (!loadedTemplate) {
    return {
      detected: false,
      confidence: 0,
      boundingBox: null,
      reason: "No logo template available. Place authorized template at assets/zinkgame/zinkgame-logo-template.png",
    };
  }

  const image = await decodeGrayscale(imageBuffer);

  const scales = options.scales ?? LOGO_DETECTION_SCALES;
  let best: LogoMatch | null = null;

  for (const scale of scales) {
    const candidate = await matchAtScale(image, loadedTemplate, scale);
    if (candidate && (!best || candidate.score > best.score)) {
      best = candidate;
    }
  }

  if (best) {
    const coarseScale = best.scale;
    for (const multiplier of LOGO_SCALE_REFINE_MULTIPLIERS) {
      const candidate = await matchAtScale(
        image,
        loadedTemplate,
        coarseScale * multiplier
      );
      if (candidate && candidate.score > best.score) {
        best = candidate;
      }
    }
  }

  if (!best || best.score < LOGO_CONFIDENCE_REVIEW) {
    return {
      detected: false,
      confidence: best ? Math.max(0, best.score) : 0,
      boundingBox: null,
      reason: best
        ? `Best match confidence ${best.score.toFixed(3)} below review threshold ${LOGO_CONFIDENCE_REVIEW}.`
        : "No template match found within image bounds.",
      scale: best?.scale,
    };
  }

  const reviewRequired =
    best.score >= LOGO_CONFIDENCE_REVIEW && best.score < LOGO_CONFIDENCE_AUTO;

  return {
    detected: true,
    confidence: best.score,
    boundingBox: best.box,
    reason: reviewRequired
      ? `Logo detected with confidence ${best.score.toFixed(3)} — needs manual review.`
      : `Logo detected with confidence ${best.score.toFixed(3)}.`,
    reviewRequired,
    scale: best.scale,
  };
}
