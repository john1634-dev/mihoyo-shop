import "server-only";

import { getSupabaseService } from "@/lib/supabase-service";

export const PRODUCT_IMAGES_BUCKET = "product-images";
export const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionForImageFormat(
  format: "jpeg" | "png" | "webp"
): string {
  if (format === "jpeg") return "jpg";
  return format;
}

export function extensionForContentType(contentType: string): string | null {
  return CONTENT_TYPE_EXTENSION[contentType.trim().toLowerCase()] ?? null;
}

export function buildSupplierOriginalStoragePath(
  productId: string,
  extension: string
): string {
  return `products/${productId}/supplier/original/${crypto.randomUUID()}.${extension}`;
}

export function buildSupplierProcessedStoragePath(
  productId: string,
  extension: string
): string {
  return `products/${productId}/supplier/processed/${crypto.randomUUID()}.${extension}`;
}

export function extractProductImageStoragePath(
  publicUrl: string | null | undefined
): string | null {
  if (!publicUrl?.trim()) return null;

  try {
    const url = new URL(publicUrl.trim());
    const marker = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
    const index = url.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

export async function uploadProductImageBuffer(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<{ path: string; publicUrl: string }> {
  if (buffer.byteLength > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error("Image exceeds 8 MB upload limit.");
  }

  const svc = getSupabaseService();
  const { error } = await svc.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    });

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = svc.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath);

  return { path: storagePath, publicUrl };
}

export async function removeProductImageStoragePaths(
  paths: string[]
): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;

  const svc = getSupabaseService();
  await svc.storage.from(PRODUCT_IMAGES_BUCKET).remove(unique);
}

export function contentTypeForFormat(format: "jpeg" | "png" | "webp"): string {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  return "image/webp";
}
