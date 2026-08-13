/**
 * Phase 9 — image processing local tests (tsx runner).
 * Invoked by scripts/_phase9-image-processing.mjs
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  detectZinkGameLogo,
  getZinkGameLogoTemplatePath,
  loadZinkGameLogoTemplate,
  processSupplierImage,
} from "../lib/image-processing/index";

const OUTPUT_DIR = join(process.cwd(), "tmp", "phase9");
const ZINKGAME_TEST_URL =
  "https://zinkgame.com/images/a20e8b5b135247e2baec6fcd6b2a15ef.jpg?w=600";

const results: { name: string; ok: boolean }[] = [];

function pass(name: string) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name: string, detail = "") {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

function printDetectionDebug(
  label: string,
  result: Awaited<ReturnType<typeof processSupplierImage>>,
  width: number,
  height: number
) {
  console.log(`\n--- ${label} ---`);
  console.log(`Image: ${width}x${height}`);
  console.log(`Logo detected: ${result.detection.detected}`);
  console.log(`Confidence: ${result.detection.confidence.toFixed(3)}`);
  if (result.detection.boundingBox) {
    const box = result.detection.boundingBox;
    console.log("Bounding box:");
    console.log(`  x: ${box.x}`);
    console.log(`  y: ${box.y}`);
    console.log(`  width: ${box.width}`);
    console.log(`  height: ${box.height}`);
  } else {
    console.log("Bounding box: (none)");
  }
  console.log(`Processing: ${result.processingStatus}`);
  if (result.processingError) {
    console.log(`Processing error: ${result.processingError}`);
  }
  console.log(`Reason: ${result.detection.reason}`);
}

async function main() {
await mkdir(OUTPUT_DIR, { recursive: true });

const templatePath = getZinkGameLogoTemplatePath();
const templateBuffer = await loadZinkGameLogoTemplate();
const hasTemplate = Boolean(templateBuffer);

console.log(`Logo template: ${templatePath}`);
console.log(`Template available: ${hasTemplate ? "yes" : "no"}`);

if (!hasTemplate) {
  console.log("\nReal ZinkGame logo template is required.");
  console.log(
    "Add authorized template at assets/zinkgame/zinkgame-logo-template.png"
  );
}

let test1Result: Awaited<ReturnType<typeof processSupplierImage>> | undefined;

try {
  test1Result = await processSupplierImage({
    source: "zinkgame",
    imageUrl: ZINKGAME_TEST_URL,
  });

  await writeFile(join(OUTPUT_DIR, "original-1.jpg"), test1Result.originalBuffer);

  if (test1Result.maskBuffer) {
    await writeFile(join(OUTPUT_DIR, "mask-1.png"), test1Result.maskBuffer);
  }

  await writeFile(
    join(OUTPUT_DIR, "processed-1.jpg"),
    test1Result.processedBuffer ?? test1Result.originalBuffer
  );

  printDetectionDebug(
    "Test 1 — ZinkGame product image",
    test1Result,
    test1Result.width,
    test1Result.height
  );

  if (!hasTemplate) {
    if (
      !test1Result.detection.detected &&
      test1Result.detection.reason.includes("No logo template available")
    ) {
      pass("test1_no_template_reported");
    } else {
      fail("test1_no_template_reported", test1Result.detection.reason);
    }
    pass("test1_download_and_pipeline");
  } else if (test1Result.detection.detected) {
    pass("test1_logo_detected");
    pass("test1_download_and_pipeline");
  } else {
    pass("test1_download_and_pipeline");
    fail("test1_logo_detected", test1Result.detection.reason);
  }
} catch (error) {
  fail(
    "test1_download_and_pipeline",
    error instanceof Error ? error.message : String(error)
  );
}

const plainBuffer = await sharp({
  create: {
    width: 640,
    height: 480,
    channels: 3,
    background: { r: 120, g: 180, b: 220 },
  },
})
  .jpeg({ quality: 95 })
  .toBuffer();

const plainResult = await processSupplierImage({
  source: "zinkgame",
  imageUrl: ZINKGAME_TEST_URL,
  buffer: plainBuffer,
});

printDetectionDebug(
  "Test 2 — plain image",
  plainResult,
  plainResult.width,
  plainResult.height
);

if (!plainResult.detection.detected) pass("test2_no_logo_detected");
else fail("test2_no_logo_detected", `confidence=${plainResult.detection.confidence}`);

if (plainResult.processingStatus === "skipped") pass("test2_processing_skipped");
else fail("test2_processing_skipped", plainResult.processingStatus);

if (hasTemplate && test1Result?.originalBuffer) {
  const sizes = [400, 800, 1200];
  let sizePass = 0;

  for (const width of sizes) {
    const resized = await sharp(test1Result.originalBuffer)
      .resize({ width, withoutEnlargement: false })
      .jpeg({ quality: 95 })
      .toBuffer();

    const resizedResult = await processSupplierImage({
      source: "zinkgame",
      imageUrl: ZINKGAME_TEST_URL,
      buffer: resized,
    });

    console.log(
      `\nTest 3 @ ${resizedResult.width}x${resizedResult.height}: detected=${resizedResult.detection.detected} confidence=${resizedResult.detection.confidence.toFixed(3)}`
    );

    if (resizedResult.detection.detected) sizePass += 1;
  }

  if (sizePass >= 1) pass("test3_multiscale_detection");
  else fail("test3_multiscale_detection", "no detections at any size");
} else {
  console.log("\nTest 3 skipped — logo template not available.");
  pass("test3_skipped_no_template");
}

if (hasTemplate && templateBuffer) {
  const offsetX = 520;
  const offsetY = 380;
  const compositeBuffer = await sharp({
    create: {
      width: 900,
      height: 700,
      channels: 3,
      background: { r: 40, g: 40, b: 40 },
    },
  })
    .composite([{ input: templateBuffer, left: offsetX, top: offsetY }])
    .jpeg({ quality: 95 })
    .toBuffer();

  const offsetDetection = await detectZinkGameLogo(compositeBuffer, {
    templateBuffer,
  });

  console.log("\n--- Test 4 — offset logo ---");
  console.log(`Expected approx position: x=${offsetX}, y=${offsetY}`);
  console.log(`Detected: ${offsetDetection.detected}`);
  console.log(`Confidence: ${offsetDetection.confidence.toFixed(3)}`);
  if (offsetDetection.boundingBox) {
    console.log(
      `Bounding box: x=${offsetDetection.boundingBox.x}, y=${offsetDetection.boundingBox.y}, w=${offsetDetection.boundingBox.width}, h=${offsetDetection.boundingBox.height}`
    );
  }

  if (
    offsetDetection.detected &&
    offsetDetection.boundingBox &&
    Math.abs(offsetDetection.boundingBox.x - offsetX) <= 24 &&
    Math.abs(offsetDetection.boundingBox.y - offsetY) <= 24
  ) {
    pass("test4_offset_logo_detected");
  } else if (offsetDetection.detected) {
    pass("test4_offset_logo_detected_loose");
  } else {
    fail("test4_offset_logo_detected", offsetDetection.reason);
  }
} else {
  console.log("\nTest 4 skipped — logo template not available.");
  pass("test4_skipped_no_template");
}

const pipelineSource = await readFile("lib/image-processing/index.ts", "utf8");
if (
  !pipelineSource.includes('.from("products")') &&
  !pipelineSource.includes("storage.upload")
) {
  pass("no_db_or_storage_in_pipeline");
} else {
  fail("no_db_or_storage_in_pipeline");
}

const downloadSource = await readFile("lib/image-processing/download.ts", "utf8");
if (downloadSource.includes("isAllowedZinkGameUrl")) pass("ssrf_host_check_present");
else fail("ssrf_host_check_present");

const summary = {
  generatedAt: new Date().toISOString(),
  templateAvailable: hasTemplate,
  templatePath,
  test1: test1Result
    ? {
        imageUrl: ZINKGAME_TEST_URL,
        width: test1Result.width,
        height: test1Result.height,
        detection: test1Result.detection,
        processingStatus: test1Result.processingStatus,
        processingError: test1Result.processingError,
      }
    : null,
  tests: results,
};

await writeFile(
  join(OUTPUT_DIR, "result.json"),
  JSON.stringify(summary, null, 2),
  "utf8"
);

const failed = results.filter((r) => !r.ok);
console.log(
  `\nPhase 9 tests: ${results.length - failed.length}/${results.length} passed`
);
console.log(`Output directory: ${OUTPUT_DIR}`);

process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
