import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { zinkgameAdapter } from "@/lib/supplier/zinkgame";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppliers/zinkgame/listing?page=1
 * Fetch supplier listing page for admin discovery. No database writes.
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
    const listing = await zinkgameAdapter.getListingPage(page);
    return NextResponse.json(listing);
  } catch (error) {
    logServerError("admin zinkgame listing", error);
    return NextResponse.json(
      { error: toUserError(error) },
      { status: 502 }
    );
  }
}
