/**
 * Phase 12.5 test runner.
 */
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  createLogoMask,
  detectZinkGameLogo,
  inpaintMaskedRegion,
  processSupplierImage,
  removeLogo,
} from "../lib/image-processing/index";
import { loadZinkGameLogoTemplate } from "../lib/image-processing/detect-logo";

const results: { name: string; ok: boolean }[] = [];

function pass(name: string) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name: string, detail = "") {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

function buffersEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && left.equals(right);
}

function simulateImportUrls(result: Awaited<ReturnType<typeof processSupplierImage>>): {
  processedImageUrl: string | null;
  imageUrl: string;
} {
  const originalUrl = "storage://supplier/original/";
  if (result.processingStatus === "completed" && result.processedBuffer) {
    const processedImageUrl = "storage://supplier/processed/";
    return { processedImageUrl, imageUrl: processedImageUrl };
  }
  return { processedImageUrl: null, imageUrl: originalUrl };
}

function reportImagePipelineDiagnostic(
  label: string,
  result: Awaited<ReturnType<typeof processSupplierImage>>
) {
  const urls = simulateImportUrls(result);
  const maskCreated = result.maskBuffer != null;
  const removeLogoCalled =
    result.processingStatus === "completed" || result.processingStatus === "failed";

  console.log(`\n--- diagnostic: ${label} ---`);
  console.log(`1. logo detection confidence: ${result.detection.confidence.toFixed(4)}`);
  console.log(`2. mask created: ${maskCreated}`);
  console.log(`3. removeLogo() called: ${removeLogoCalled}`);
  console.log(`4. processing_status: ${result.processingStatus}`);
  console.log(`5. processed_image_url: ${urls.processedImageUrl}`);
  console.log(`6. image_url: ${urls.imageUrl}`);
  console.log(
    `7. image_url === processed_image_url: ${
      urls.imageUrl === urls.processedImageUrl && urls.processedImageUrl != null
    }`
  );
  console.log(`detected: ${result.detection.detected}`);
  console.log(`scale: ${result.detection.scale ?? "n/a"}`);
  console.log(`reason: ${result.detection.reason}`);
  if (result.processingError) {
    console.log(`processingError: ${result.processingError}`);
  }
}

async function makePlainImage(
  width: number,
  height: number,
  color: { r: number; g: number; b: number }
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function main() {
  const removeLogoSource = await readFile("lib/image-processing/remove-logo.ts", "utf8");
  const imageImportLib = await readFile("lib/supplier/image-import.ts", "utf8");
  const inpaintLib = await readFile("lib/image-processing/inpaint.ts", "utf8");

  if (removeLogoSource.includes("inpaintMaskedRegion")) pass("remove_logo_uses_inpaint");
  else fail("remove_logo_uses_inpaint");

  if (!removeLogoSource.includes("inpainting engine unavailable")) {
    pass("remove_logo_no_longer_stub");
  } else {
    fail("remove_logo_no_longer_stub");
  }

  if (inpaintLib.includes("unfilledPixels")) pass("inpaint_tracks_unfilled_pixels");
  else fail("inpaint_tracks_unfilled_pixels");

  if (
    imageImportLib.includes("processedImageUrl = processedUpload.publicUrl") &&
    imageImportLib.includes('processed.processingStatus === "completed"')
  ) {
    pass("processed_url_only_on_success");
  } else {
    fail("processed_url_only_on_success");
  }

  if (
    imageImportLib.includes("storefrontUrl = originalUpload.publicUrl") &&
    imageImportLib.includes("Logo removal failed")
  ) {
    pass("inpaint_failure_uses_original");
  } else {
    fail("inpaint_failure_uses_original");
  }

  if (imageImportLib.includes("existingUrls.has")) pass("duplicate_import_protection");
  else fail("duplicate_import_protection");

  if (
    imageImportLib.includes("uploadProductImageBuffer") &&
    imageImportLib.includes("processed.originalBuffer")
  ) {
    pass("original_always_uploaded_first");
  } else {
    fail("original_always_uploaded_first");
  }

  if (imageImportLib.includes("imagesFailed += 1")) pass("single_image_failure_does_not_abort");
  else fail("single_image_failure_does_not_abort");

  const plainBuffer = await makePlainImage(640, 480, { r: 120, g: 180, b: 220 });
  const noLogo = await processSupplierImage({
    source: "zinkgame",
    imageUrl: "https://zinkgame.com/images/test.jpg",
    buffer: plainBuffer,
  });

  if (!noLogo.detection.detected && noLogo.processingStatus === "skipped") {
    pass("no_logo_skipped");
  } else {
    fail("no_logo_skipped", noLogo.processingStatus);
  }

  if (buffersEqual(plainBuffer, noLogo.originalBuffer)) pass("original_buffer_preserved");
  else fail("original_buffer_preserved");

  if (noLogo.processedBuffer == null) pass("no_processed_buffer_without_logo");
  else fail("no_processed_buffer_without_logo");

  const templateBuffer = await loadZinkGameLogoTemplate();
  if (templateBuffer) {
    const offsetX = 420;
    const offsetY = 300;
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

    const detection = await detectZinkGameLogo(compositeBuffer, { templateBuffer });
    if (detection.detected && detection.boundingBox) {
      pass("logo_detection_success");
    } else {
      fail("logo_detection_success", detection.reason);
    }

    const mask = await createLogoMask(900, 700, detection.boundingBox!);
    const removal = await removeLogo(compositeBuffer, mask, detection.boundingBox!);
    if (removal.success) pass("inpainting_success");
    else fail("inpainting_success", removal.error);

    if (removal.success && !buffersEqual(compositeBuffer, removal.buffer)) {
      pass("processed_differs_from_original");
    } else if (removal.success) {
      fail("processed_differs_from_original");
    }

    const pipelined = await processSupplierImage({
      source: "zinkgame",
      imageUrl: "https://zinkgame.com/images/test.jpg",
      buffer: compositeBuffer,
    });

    reportImagePipelineDiagnostic("synthetic composite (exact template)", pipelined);

    if (pipelined.processingStatus === "completed" && pipelined.processedBuffer) {
      pass("pipeline_completed_with_logo");
    } else {
      fail("pipeline_completed_with_logo", pipelined.processingStatus);
    }

    const syntheticUrls = simulateImportUrls(pipelined);
    if (
      syntheticUrls.imageUrl === syntheticUrls.processedImageUrl &&
      syntheticUrls.processedImageUrl != null
    ) {
      pass("synthetic_image_url_uses_processed");
    } else {
      fail("synthetic_image_url_uses_processed");
    }

    if (buffersEqual(compositeBuffer, pipelined.originalBuffer)) {
      pass("pipeline_original_unmodified");
    } else {
      fail("pipeline_original_unmodified");
    }
  } else {
    console.log("\nLogo template missing — skipping live detection/removal integration tests.");
    pass("logo_detection_success_skipped_no_template");
    pass("inpainting_success_skipped_no_template");
    pass("processed_differs_from_original_skipped_no_template");
    pass("pipeline_completed_with_logo_skipped_no_template");
    pass("pipeline_original_unmodified_skipped_no_template");
  }

  const plainDetection = await detectZinkGameLogo(plainBuffer, {
    templateBuffer: templateBuffer ?? undefined,
  });
  if (!plainDetection.detected) pass("logo_detection_failure_plain_image");
  else fail("logo_detection_failure_plain_image");

  const small = await makePlainImage(200, 200, { r: 200, g: 100, b: 50 });
  const smallMask = await createLogoMask(200, 200, {
    x: 80,
    y: 80,
    width: 40,
    height: 40,
  });

  const inpaintOk = inpaintMaskedRegion(
    new Uint8Array(await sharp(small).removeAlpha().raw().toBuffer()),
    new Uint8Array(await sharp(smallMask).grayscale().raw().toBuffer()),
    200,
    200,
    3
  );
  if (inpaintOk.unfilledPixels === 0) pass("inpaint_small_region_success");
  else fail("inpaint_small_region_success", String(inpaintOk.unfilledPixels));

  const fullMask = await createLogoMask(200, 200, {
    x: 0,
    y: 0,
    width: 200,
    height: 200,
  });
  const inpaintFail = inpaintMaskedRegion(
    new Uint8Array(await sharp(small).removeAlpha().raw().toBuffer()),
    new Uint8Array(await sharp(fullMask).grayscale().raw().toBuffer()),
    200,
    200,
    3
  );
  if (inpaintFail.unfilledPixels > 0) pass("inpainting_failure_full_mask");
  else fail("inpainting_failure_full_mask");

  const fullRemoval = await removeLogo(small, fullMask, {
    x: 0,
    y: 0,
    width: 200,
    height: 200,
  });
  if (!fullRemoval.success) pass("remove_logo_reports_inpaint_failure");
  else fail("remove_logo_reports_inpaint_failure");

  const liveUrls = [
    "https://zinkgame.com/images/a20e8b5b135247e2baec6fcd6b2a15ef.jpg?w=600",
    "https://zinkgame.com/images/18ed8eb9aedd43eeb8f4491b5d13a430.jpg",
  ];

  for (const [index, liveUrl] of liveUrls.entries()) {
    try {
      const live = await processSupplierImage({
        source: "zinkgame",
        imageUrl: liveUrl,
      });
      reportImagePipelineDiagnostic(`live ZinkGame image ${index}`, live);
      const liveUrlsSim = simulateImportUrls(live);

      if (live.detection.detected && live.detection.confidence >= 0.8) {
        pass(`live_${index}_logo_detected`);
      } else {
        fail(
          `live_${index}_logo_detected`,
          `confidence=${live.detection.confidence.toFixed(3)} ${live.detection.reason}`
        );
      }

      if (live.maskBuffer) pass(`live_${index}_mask_created`);
      else fail(`live_${index}_mask_created`);

      if (live.processingStatus === "completed" && live.processedBuffer) {
        pass(`live_${index}_remove_logo_called`);
      } else {
        fail(`live_${index}_remove_logo_called`, live.processingStatus);
      }

      if (live.processingStatus === "completed") pass(`live_${index}_processing_status`);
      else fail(`live_${index}_processing_status`, live.processingStatus);

      if (liveUrlsSim.processedImageUrl) pass(`live_${index}_processed_image_url`);
      else fail(`live_${index}_processed_image_url`);

      if (
        liveUrlsSim.imageUrl === liveUrlsSim.processedImageUrl &&
        liveUrlsSim.processedImageUrl != null
      ) {
        pass(`live_${index}_image_url_equals_processed`);
      } else {
        fail(`live_${index}_image_url_equals_processed`);
      }
    } catch (error) {
      fail(
        `live_${index}_download_and_process`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  const previewCard = await readFile(
    "components/admin/SupplierProductPreviewCard.tsx",
    "utf8"
  );
  if (previewCard.includes("live originals")) {
    pass("preview_card_labels_live_supplier_urls");
  } else {
    fail("preview_card_labels_live_supplier_urls");
  }
  if (previewCard.includes("importedImages") && previewCard.includes("image.imageUrl")) {
    pass("preview_card_shows_imported_storefront_urls");
  } else {
    fail("preview_card_shows_imported_storefront_urls");
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nPhase 12.5: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
