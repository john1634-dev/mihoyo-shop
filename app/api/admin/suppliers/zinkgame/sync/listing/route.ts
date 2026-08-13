import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { buildListingSyncPreview } from "@/lib/supplier/sync-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppliers/zinkgame/sync/listing?page=1
 * Listing sync check — match + diff. No database writes.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  const url = new URL(request.url);
  const pageRaw = url.searchParams.get("page") ?? "1";
  const page = Number.parseInt(pageRaw, 10);

  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  }

  try {
    const listing = await buildListingSyncPreview(admin.client, page);
    return NextResponse.json(listing);
  } catch (error) {
    logServerError("admin zinkgame sync listing", error);
    return NextResponse.json(
      { error: toUserError(error) },
      { status: 502 }
    );
  }
}
