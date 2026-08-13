import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { runZinkGameCategoryAutoImport } from "@/lib/supplier/auto-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AutoImportBody = {
  confirm?: boolean;
};

/**
 * POST /api/admin/suppliers/zinkgame/auto-import
 * Dry run (confirm: false) or import allowlisted category products (confirm: true).
 * Browser title/price/category/images/translatedTitle are ignored.
 * Server re-fetches live ZinkGame data.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  let body: AutoImportBody;
  try {
    body = (await request.json()) as AutoImportBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.confirm !== true && body.confirm !== false) {
    return NextResponse.json(
      { error: "Provide confirm: true or confirm: false." },
      { status: 400 }
    );
  }

  try {
    const result = await runZinkGameCategoryAutoImport(admin.client, {
      confirm: body.confirm,
    });

    if (result.sourceUnavailable) {
      return NextResponse.json(result, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logServerError("admin zinkgame auto-import", error);
    return NextResponse.json(
      { error: toUserError(error) },
      { status: 500 }
    );
  }
}
