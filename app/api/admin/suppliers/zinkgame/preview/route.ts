import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError, toUserError } from "@/lib/errors";
import { isAllowedZinkGameUrl } from "@/lib/supplier/config";
import { getImportStatus } from "@/lib/supplier/import";
import { buildSupplierProductPreview } from "@/lib/supplier/preview";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import {
  zinkgameAdapter,
  ZinkGameFetchError,
} from "@/lib/supplier/zinkgame";
import {
  extractProductIdFromUrl,
  ZINKGAME_PRODUCT_ID_PATTERN,
} from "@/lib/supplier/zinkgame/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewBody = {
  url?: string;
  productId?: string;
  markupPercent?: number;
};

type ImportedImageRow = {
  image_url: string;
  processed_image_url: string | null;
  processing_status: string | null;
  original_image_url: string | null;
  sort_order: number;
};

async function loadImportedSupplierImages(
  client: SupabaseClient,
  productId: string
) {
  const { data, error } = await client
    .from("product_images")
    .select(
      "image_url, processed_image_url, processing_status, original_image_url, sort_order"
    )
    .eq("product_id", productId)
    .eq("image_source", "supplier")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  return (data as ImportedImageRow[]).map((row) => ({
    imageUrl: row.image_url,
    processedImageUrl: row.processed_image_url,
    processingStatus: row.processing_status ?? "unknown",
    originalImageUrl: row.original_image_url,
  }));
}

/**
 * POST /api/admin/suppliers/zinkgame/preview
 * Fetch → parse → derive account-code title → price → return JSON. No database writes.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  let body: PreviewBody;
  try {
    body = (await request.json()) as PreviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const url = body.url?.trim() || "";
  const productId = body.productId?.trim().toLowerCase() || "";
  const markupPercent =
    body.markupPercent !== undefined ? Number(body.markupPercent) : undefined;

  if (!url && !productId) {
    return NextResponse.json(
      { error: "Provide either url or productId." },
      { status: 400 }
    );
  }

  if (url && productId) {
    return NextResponse.json(
      { error: "Provide url or productId, not both." },
      { status: 400 }
    );
  }

  if (
    markupPercent !== undefined &&
    (!Number.isFinite(markupPercent) || markupPercent < 0)
  ) {
    return NextResponse.json(
      { error: "Invalid markupPercent." },
      { status: 400 }
    );
  }

  if (productId && !ZINKGAME_PRODUCT_ID_PATTERN.test(productId)) {
    return NextResponse.json(
      { error: "Invalid ZinkGame product id." },
      { status: 400 }
    );
  }

  if (url) {
    if (!isAllowedZinkGameUrl(url)) {
      return NextResponse.json(
        { error: "URL host is not allowed. Only ZinkGame URLs are permitted." },
        { status: 400 }
      );
    }

    const idFromUrl = extractProductIdFromUrl(url);
    if (!idFromUrl) {
      return NextResponse.json(
        { error: "URL must point to a ZinkGame product page (/product/{id})." },
        { status: 400 }
      );
    }
  }

  try {
    const product = await zinkgameAdapter.getProduct(
      url ? { url } : { productId }
    );

    const preview = await buildSupplierProductPreview(product, {
      markupPercent,
    });

    const importStatus = await getImportStatus(
      admin.client,
      product,
      preview.costMyr != null &&
        preview.sellingPriceMyr != null &&
        !preview.pricingError
    );

    const importedImages = importStatus.existingProductId
      ? await loadImportedSupplierImages(
          admin.client,
          importStatus.existingProductId
        )
      : [];

    return NextResponse.json({
      ...preview,
      importStatus,
      importedImages,
    });
  } catch (error) {
    if (error instanceof ZinkGameFetchError) {
      const status =
        error.status === 404
          ? 404
          : error.message.includes("timed out")
            ? 504
            : 502;

      logServerError("admin zinkgame preview", {
        message: error.message,
        url: error.url,
        status: error.status,
      });

      return NextResponse.json(
        { error: toUserError(error.message) },
        { status }
      );
    }

    logServerError("admin zinkgame preview", error);
    return NextResponse.json(
      { error: "Failed to preview supplier product." },
      { status: 500 }
    );
  }
}
