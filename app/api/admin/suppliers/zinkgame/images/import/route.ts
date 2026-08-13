import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { importSupplierProductImages } from "@/lib/supplier/image-import";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageImportBody = {
  productId?: string;
  confirm?: boolean;
  /** Ignored — server re-fetches supplier images. */
  images?: Array<{ url?: string }>;
};

/**
 * POST /api/admin/suppliers/zinkgame/images/import
 * Download → validate → detect logo → preserve original → upload → product_images.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  let body: ImageImportBody;
  try {
    body = (await request.json()) as ImageImportBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const productId = body.productId?.trim() || "";

  if (!productId) {
    return NextResponse.json({ error: "Provide productId." }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      {
        imported: false,
        reason: "not_confirmed",
        message: "Image import requires confirm: true.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await importSupplierProductImages(admin.client, { productId });

    if (!result.imported) {
      const status =
        result.reason === "not_found"
          ? 404
          : result.reason === "invalid_source"
            ? 422
            : result.reason === "fetch_failed"
              ? 502
              : result.reason === "no_images"
                ? 422
                : 400;

      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    logServerError("admin zinkgame image import", error);
    return NextResponse.json(
      {
        imported: false,
        reason: "import_failed",
        message: toUserError(error),
      },
      { status: 500 }
    );
  }
}
