import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { isAllowedZinkGameUrl } from "@/lib/supplier/config";
import { buildSupplierSyncPreview } from "@/lib/supplier/sync-run";
import {
  extractProductIdFromUrl,
  ZINKGAME_PRODUCT_ID_PATTERN,
} from "@/lib/supplier/zinkgame/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncPreviewBody = {
  productId?: string;
  externalProductId?: string;
  url?: string;
};

/**
 * POST /api/admin/suppliers/zinkgame/sync/preview
 * Fetch live supplier → diff against existing product. No database writes.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  let body: SyncPreviewBody;
  try {
    body = (await request.json()) as SyncPreviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const productId = body.productId?.trim() || "";
  const externalProductId = body.externalProductId?.trim().toLowerCase() || "";
  const url = body.url?.trim() || "";

  const identifiers = [productId, externalProductId, url].filter(Boolean);
  if (identifiers.length === 0) {
    return NextResponse.json(
      { error: "Provide productId, externalProductId, or url." },
      { status: 400 }
    );
  }

  if (identifiers.length > 1) {
    return NextResponse.json(
      { error: "Provide only one of productId, externalProductId, or url." },
      { status: 400 }
    );
  }

  if (externalProductId && !ZINKGAME_PRODUCT_ID_PATTERN.test(externalProductId)) {
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

  try {
    const result = await buildSupplierSyncPreview(admin.client, {
      productId: productId || undefined,
      externalProductId: externalProductId || undefined,
      url: url || undefined,
    });

    const { livePreview, ...preview } = result;
    void livePreview;
    return NextResponse.json(preview);
  } catch (error) {
    logServerError("admin zinkgame sync preview", error);
    return NextResponse.json(
      { error: toUserError(error) },
      { status: 502 }
    );
  }
}
