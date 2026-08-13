import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { isValidUuid } from "@/lib/inventory";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["available", "sold", "hidden"]);

type StatusBody = {
  product_id?: string;
  status?: string;
};

/**
 * POST /api/admin/products/status
 * Updates products.status only — does not modify inventory.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  let body: StatusBody;
  try {
    body = (await request.json()) as StatusBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const productId = body.product_id?.trim() || "";
  const status = body.status?.trim() || "";

  if (!productId || !isValidUuid(productId)) {
    return NextResponse.json({ error: "Invalid product id." }, { status: 400 });
  }

  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid product status." }, { status: 400 });
  }

  const { data, error } = await admin.client
    .from("products")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .select("id,title,slug,status,updated_at")
    .maybeSingle();

  if (error) {
    logServerError("admin products status POST", error);
    return NextResponse.json(
      { error: toUserError(error.message) },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "This listing could not be found. Please refresh and try again." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    product: {
      id: data.id,
      title: data.title,
      slug: data.slug,
      status: data.status,
      updated_at: data.updated_at,
    },
    status: data.status,
  });
}
