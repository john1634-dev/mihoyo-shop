import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { listSupplierSyncRuns } from "@/lib/supplier/sync-run-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppliers/zinkgame/sync/runs
 * Latest supplier auto-sync history (admin only).
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit") ?? "20";
  const limit = Number.parseInt(limitRaw, 10);

  if (!Number.isInteger(limit) || limit < 1) {
    return NextResponse.json({ error: "Invalid limit." }, { status: 400 });
  }

  try {
    const runs = await listSupplierSyncRuns(admin.client, { limit });
    return NextResponse.json({ runs });
  } catch (error) {
    logServerError("admin zinkgame sync runs", error);
    return NextResponse.json({ error: toUserError(error) }, { status: 500 });
  }
}
