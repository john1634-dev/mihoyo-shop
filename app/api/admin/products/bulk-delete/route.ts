import { NextResponse } from "next/server";
import {
  ADMIN_BULK_DELETE_MAX,
  bulkDeleteAdminProducts,
} from "@/lib/admin-product-delete";
import { logServerError, toUserError } from "@/lib/errors";
import { isValidUuid } from "@/lib/inventory";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type BulkDeleteBody = {
  product_ids?: string[];
  confirm?: boolean;
};

/**
 * POST /api/admin/products/bulk-delete
 * Hard-deletes listings without order history; hides listings with order history.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  let body: BulkDeleteBody;
  try {
    body = (await request.json()) as BulkDeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Bulk deletion requires confirm: true." },
      { status: 400 }
    );
  }

  const rawIds = body.product_ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json(
      { error: "product_ids must be a non-empty array." },
      { status: 400 }
    );
  }

  if (rawIds.length > ADMIN_BULK_DELETE_MAX) {
    return NextResponse.json(
      {
        error: `Bulk deletion is limited to ${ADMIN_BULK_DELETE_MAX} products per request.`,
      },
      { status: 400 }
    );
  }

  const productIds: string[] = [];
  for (const id of rawIds) {
    if (typeof id !== "string") {
      return NextResponse.json({ error: "Invalid product id." }, { status: 400 });
    }
    const trimmed = id.trim();
    if (!trimmed || !isValidUuid(trimmed)) {
      return NextResponse.json({ error: "Invalid product id." }, { status: 400 });
    }
    productIds.push(trimmed);
  }

  try {
    const summary = await bulkDeleteAdminProducts(admin.client, {
      productIds,
      confirm: true,
    });

    return NextResponse.json({
      ok: true,
      ...summary,
      results: summary.results.map((result) => ({
        productId: result.productId,
        deleted: result.deleted,
        hidden: "hidden" in result ? result.hidden : false,
        reason: "reason" in result ? result.reason : undefined,
        message: "message" in result ? result.message : undefined,
        title: "title" in result ? result.title : undefined,
        storageCleanupFailed:
          "storageCleanupFailed" in result ? result.storageCleanupFailed : undefined,
      })),
    });
  } catch (error) {
    logServerError("admin products bulk-delete POST", error);
    return NextResponse.json({ error: toUserError(error) }, { status: 500 });
  }
}
