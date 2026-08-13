import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/errors";
import { processSupplierImage } from "@/lib/image-processing";
import {
  buildSupplierOriginalStoragePath,
  buildSupplierProcessedStoragePath,
  contentTypeForFormat,
  extensionForImageFormat,
  removeProductImageStoragePaths,
  uploadProductImageBuffer,
} from "@/lib/supplier/image-storage";
import type { SupplierProduct, SupplierProductImage } from "@/lib/supplier/types";
import { zinkgameAdapter } from "@/lib/supplier/zinkgame";

const SOURCE = "zinkgame";
const IMAGE_IMPORT_CONCURRENCY = 2;
const MIN_IMAGE_DIMENSION = 64;
const MAX_IMAGE_DIMENSION = 8000;

export type SupplierImageImportItem = {
  originalImageUrl: string;
  imageUrl: string;
  imagePath: string;
  processingStatus: string;
  processedImageUrl: string | null;
  processingError: string | null;
  sortOrder: number;
};

export type SupplierImageImportSuccess = {
  imported: true;
  productId: string;
  imagesProcessed: number;
  imagesSkipped: number;
  imagesFailed: number;
  imagesAlreadyImported: number;
  coverImageUrl: string | null;
  items: SupplierImageImportItem[];
};

export type SupplierImageImportFailure = {
  imported: false;
  reason:
    | "not_found"
    | "invalid_source"
    | "fetch_failed"
    | "no_images"
    | "import_failed";
  message?: string;
};

export type SupplierImageImportResult =
  | SupplierImageImportSuccess
  | SupplierImageImportFailure;

type ProductRow = {
  id: string;
  source: string | null;
  source_product_id: string | null;
  cover_image_url: string | null;
};

type ExistingImageRow = {
  id: string;
  original_image_url: string | null;
  sort_order: number;
};

function normalizeImageUrl(url: string): string {
  return url.trim();
}

function validateImageDimensions(width: number, height: number): string | null {
  if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    return `Image too small (${width}x${height}).`;
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return `Image too large (${width}x${height}).`;
  }
  return null;
}

async function loadProduct(
  client: SupabaseClient,
  productId: string
): Promise<ProductRow | null> {
  const { data, error } = await client
    .from("products")
    .select("id,source,source_product_id,cover_image_url")
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  return (data as ProductRow | null) ?? null;
}

async function loadExistingSupplierImages(
  client: SupabaseClient,
  productId: string
): Promise<ExistingImageRow[]> {
  const { data, error } = await client
    .from("product_images")
    .select("id,original_image_url,sort_order")
    .eq("product_id", productId)
    .eq("image_source", "supplier");

  if (error) throw error;
  return (data ?? []) as ExistingImageRow[];
}

async function fetchLiveSupplierProduct(
  externalProductId: string
): Promise<SupplierProduct> {
  return zinkgameAdapter.getProduct({ productId: externalProductId });
}

function sortSupplierImages(images: SupplierProductImage[]): SupplierProductImage[] {
  return [...images].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
  );
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;

  let index = 0;
  async function runWorker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }

  const poolSize = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
}

type PreparedImage = {
  supplierImage: SupplierProductImage;
  sortOrder: number;
};

async function importOneSupplierImage(
  client: SupabaseClient,
  productId: string,
  prepared: PreparedImage
): Promise<SupplierImageImportItem> {
  const supplierUrl = normalizeImageUrl(prepared.supplierImage.url);
  const uploadedPaths: string[] = [];

  let processed;
  try {
    processed = await processSupplierImage({
      source: SOURCE,
      imageUrl: supplierUrl,
    });
  } catch (error) {
    throw error;
  }

  try {
    const extension = extensionForImageFormat(processed.format);
    const contentType = contentTypeForFormat(processed.format);

    const originalPath = buildSupplierOriginalStoragePath(productId, extension);
    const originalUpload = await uploadProductImageBuffer(
      processed.originalBuffer,
      originalPath,
      contentType
    );
    uploadedPaths.push(originalUpload.path);

    const dimensionError = validateImageDimensions(
      processed.width,
      processed.height
    );

    let processedImageUrl: string | null = null;
    let storefrontUrl = originalUpload.publicUrl;
    let storefrontPath = originalUpload.path;
    let finalStatus = processed.processingStatus;
    let processingError = processed.processingError;

    if (dimensionError) {
      finalStatus = "failed";
      processingError = dimensionError;
    } else if (
      processed.processingStatus === "completed" &&
      processed.processedBuffer
    ) {
      const processedPath = buildSupplierProcessedStoragePath(
        productId,
        extension
      );
      const processedUpload = await uploadProductImageBuffer(
        processed.processedBuffer,
        processedPath,
        contentType
      );
      uploadedPaths.push(processedUpload.path);
      processedImageUrl = processedUpload.publicUrl;
      storefrontUrl = processedUpload.publicUrl;
      storefrontPath = processedUpload.path;
    } else if (processed.processingStatus === "failed") {
      finalStatus = "failed";
      processingError =
        processingError ??
        "Logo removal failed — storefront uses preserved original.";
    } else if (processed.processingStatus === "processing") {
      finalStatus = "skipped";
    }

    const { error } = await client.from("product_images").insert({
      product_id: productId,
      image_url: storefrontUrl,
      image_path: storefrontPath,
      sort_order: prepared.sortOrder,
      image_source: "supplier",
      processing_status: finalStatus,
      original_image_url: supplierUrl,
      processed_image_url: processedImageUrl,
      processing_error: processingError,
    });

    if (error) {
      throw error;
    }

    return {
      originalImageUrl: supplierUrl,
      imageUrl: storefrontUrl,
      imagePath: storefrontPath,
      processingStatus: finalStatus,
      processedImageUrl,
      processingError,
      sortOrder: prepared.sortOrder,
    };
  } catch (error) {
    await removeProductImageStoragePaths(uploadedPaths);
    throw error;
  }
}

/**
 * Manual supplier image import for an existing ZinkGame product.
 * Re-fetches live supplier images server-side — does not trust browser URLs.
 */
export async function importSupplierProductImages(
  client: SupabaseClient,
  input: { productId: string }
): Promise<SupplierImageImportResult> {
  const productId = input.productId.trim();
  const product = await loadProduct(client, productId);

  if (!product) {
    return {
      imported: false,
      reason: "not_found",
      message: "Product not found.",
    };
  }

  if (
    product.source?.trim().toLowerCase() !== SOURCE ||
    !product.source_product_id
  ) {
    return {
      imported: false,
      reason: "invalid_source",
      message: "Only imported ZinkGame products support supplier image import.",
    };
  }

  let liveProduct: SupplierProduct;
  try {
    liveProduct = await fetchLiveSupplierProduct(product.source_product_id);
  } catch (error) {
    logServerError("supplier image import fetch", error);
    return {
      imported: false,
      reason: "fetch_failed",
      message: "Failed to fetch live supplier product.",
    };
  }

  const supplierImages = sortSupplierImages(liveProduct.images ?? []);
  if (supplierImages.length === 0) {
    return {
      imported: false,
      reason: "no_images",
      message: "Supplier product has no images.",
    };
  }

  const existingRows = await loadExistingSupplierImages(client, productId);
  const existingUrls = new Set(
    existingRows
      .map((row) => row.original_image_url?.trim())
      .filter(Boolean) as string[]
  );

  const nextSortBase =
    existingRows.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;

  const pending: PreparedImage[] = [];
  let alreadyImported = 0;

  for (const supplierImage of supplierImages) {
    const url = normalizeImageUrl(supplierImage.url);
    if (existingUrls.has(url)) {
      alreadyImported += 1;
      continue;
    }
    pending.push({
      supplierImage,
      sortOrder: nextSortBase + pending.length,
    });
  }

  if (pending.length === 0) {
    return {
      imported: true,
      productId,
      imagesProcessed: 0,
      imagesSkipped: 0,
      imagesFailed: 0,
      imagesAlreadyImported: alreadyImported,
      coverImageUrl: product.cover_image_url,
      items: [],
    };
  }

  const items: SupplierImageImportItem[] = [];
  let imagesProcessed = 0;
  let imagesSkipped = 0;
  let imagesFailed = 0;

  await processWithConcurrency(pending, IMAGE_IMPORT_CONCURRENCY, async (entry) => {
    try {
      const item = await importOneSupplierImage(client, productId, entry);
      items.push(item);
      imagesProcessed += 1;
      if (item.processingStatus === "skipped") imagesSkipped += 1;
      if (item.processingStatus === "failed") imagesFailed += 1;
    } catch (error) {
      logServerError("supplier image import item", error);
      imagesFailed += 1;
      items.push({
        originalImageUrl: entry.supplierImage.url,
        imageUrl: "",
        imagePath: "",
        processingStatus: "failed",
        processedImageUrl: null,
        processingError:
          error instanceof Error ? error.message : "Image import failed.",
        sortOrder: entry.sortOrder,
      });
    }
  });

  items.sort((left, right) => left.sortOrder - right.sortOrder);

  let coverImageUrl = product.cover_image_url;
  const firstSuccessful = items.find((item) => item.imageUrl);

  if (firstSuccessful && !product.cover_image_url) {
    await client
      .from("products")
      .update({
        cover_image_url: firstSuccessful.imageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .eq("source", SOURCE);
    coverImageUrl = firstSuccessful.imageUrl;
  }

  return {
    imported: true,
    productId,
    imagesProcessed,
    imagesSkipped,
    imagesFailed,
    imagesAlreadyImported: alreadyImported,
    coverImageUrl,
    items,
  };
}
