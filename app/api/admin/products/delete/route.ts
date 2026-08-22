import { NextResponse } from "next/server";
import { deleteAdminProduct } from "@/lib/admin-product-delete";
import { logServerError, toUserError } from "@/lib/errors";
import { isValidUuid } from "@/lib/inventory";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeleteBody = {
  product_id?: string;
  confirm?: boolean;
};

/**
 * POST /api/admin/products/delete
 * Hard-deletes listings without order history; hides listings with order history.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  let body: DeleteBody;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const productId = body.product_id?.trim() || "";
  if (!productId || !isValidUuid(productId)) {
    return NextResponse.json({ error: "Invalid product id." }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Deletion requires confirm: true." },
      { status: 400 }
    );
  }

  try {
    const result = await deleteAdminProduct(admin.client, {
      productId,
      confirm: true,
    });

    if (result.deleted) {
      return NextResponse.json({
        ok: true,
        deleted: true,
        productId: result.productId,
        title: result.title,
      });
    }

    const status =
      result.reason === "not_found"
        ? 404
        : result.reason === "has_order_history"
          ? 409
          : 400;

    return NextResponse.json(result, { status });
  } catch (error) {
    logServerError("admin products delete POST", error);
    return NextResponse.json(
      { error: toUserError(error) },
      { status: 500 }
    );
  }
}
