import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { isAllowedZinkGameUrl } from "@/lib/supplier/config";
import { importSupplierProduct } from "@/lib/supplier/import";
import {
  extractProductIdFromUrl,
  ZINKGAME_PRODUCT_ID_PATTERN,
} from "@/lib/supplier/zinkgame/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportBody = {
  productId?: string;
  url?: string;
  /** Ignored for pricing — server re-fetches supplier detail. */
  product?: {
    source?: string;
    externalProductId?: string;
  };
  translatedTitle?: string;
  markupPercent?: number;
  gameId?: string;
};

/**
 * POST /api/admin/suppliers/zinkgame/import
 * Re-fetch → revalidate → import. Admin confirmation required in UI.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const productId =
    body.productId?.trim().toLowerCase() ||
    body.product?.externalProductId?.trim().toLowerCase() ||
    "";
  const url = body.url?.trim() || "";
  const gameId = body.gameId?.trim() || undefined;
  const markupPercent =
    body.markupPercent !== undefined ? Number(body.markupPercent) : undefined;

  if (!url && !productId) {
    return NextResponse.json(
      { error: "Provide productId or url." },
      { status: 400 }
    );
  }

  if (url && productId) {
    return NextResponse.json(
      { error: "Provide productId or url, not both." },
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
        { error: "URL host is not allowed." },
        { status: 400 }
      );
    }
    const idFromUrl = extractProductIdFromUrl(url);
    if (!idFromUrl) {
      return NextResponse.json(
        { error: "Invalid ZinkGame product URL." },
        { status: 400 }
      );
    }
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

  try {
    const result = await importSupplierProduct(admin.client, {
      source: "zinkgame",
      productId: productId || undefined,
      url: url || undefined,
      markupPercent,
      gameId,
    });

    if (!result.imported) {
      const status =
        result.reason === "already_imported"
          ? 409
          : result.reason === "game_mapping_required"
            ? 422
            : result.reason === "invalid_supplier_status"
              ? 422
              : 400;

      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    logServerError("admin zinkgame import", error);
    return NextResponse.json(
      { imported: false, reason: "import_failed", message: toUserError(error) },
      { status: 500 }
    );
  }
}
