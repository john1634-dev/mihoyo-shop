import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { applySupplierSync } from "@/lib/supplier/sync-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncBody = {
  productId?: string;
  confirm?: boolean;
  /** Ignored — server re-fetches supplier detail. */
  title?: string;
  price?: number;
  sourcePrice?: number;
  sourceStatus?: string;
};

/**
 * POST /api/admin/suppliers/zinkgame/sync
 * Admin-confirmed sync only. Re-fetches supplier server-side.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  let body: SyncBody;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const productId = body.productId?.trim() || "";

  if (!productId) {
    return NextResponse.json({ error: "Provide productId." }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { synced: false, reason: "not_confirmed", message: "Sync requires confirm: true." },
      { status: 400 }
    );
  }

  try {
    const result = await applySupplierSync(admin.client, {
      productId,
      confirm: true,
    });

    if (!result.synced) {
      const status =
        result.reason === "not_found"
          ? 404
          : result.reason === "invalid_source"
            ? 422
            : result.reason === "fetch_failed"
              ? 502
              : 400;

      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    logServerError("admin zinkgame sync", error);
    return NextResponse.json(
      { synced: false, reason: "sync_failed", message: toUserError(error) },
      { status: 500 }
    );
  }
}
