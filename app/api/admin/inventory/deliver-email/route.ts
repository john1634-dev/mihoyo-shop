import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { isValidUuid } from "@/lib/inventory";
import { deliverInventoryByEmail } from "@/lib/inventory-delivery";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/inventory/deliver-email
 * Admin retry for account delivery email. Never returns credentials.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  const body = await request.json().catch(() => null);
  const orderId =
    body && typeof body === "object" && typeof (body as { order_id?: unknown }).order_id === "string"
      ? (body as { order_id: string }).order_id.trim()
      : "";

  if (!isValidUuid(orderId)) {
    return NextResponse.json(
      { ok: false, status: "failed", error_code: "INVALID_ORDER_ID" },
      { status: 400 }
    );
  }

  try {
    const result = await deliverInventoryByEmail(orderId);

    if (result.status === "already_sent") {
      return NextResponse.json({
        ok: true,
        status: "already_sent",
        order_id: result.order_id,
        inventory_item_id: result.inventory_item_id,
        provider_message_id: result.provider_message_id ?? null,
      });
    }

    if (result.status === "sent") {
      return NextResponse.json({
        ok: true,
        status: "sent",
        order_id: result.order_id,
        inventory_item_id: result.inventory_item_id,
        provider_message_id: result.provider_message_id ?? null,
      });
    }

    if (result.status === "in_progress") {
      return NextResponse.json({
        ok: true,
        status: "in_progress",
        order_id: result.order_id,
        inventory_item_id: result.inventory_item_id,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        status: result.status === "blocked" ? "failed" : result.status,
        order_id: result.order_id,
        inventory_item_id: result.inventory_item_id,
        error_code: result.error_code || "EMAIL_SEND_FAILED",
      },
      { status: result.status === "blocked" ? 409 : 500 }
    );
  } catch (error) {
    logServerError("admin inventory deliver-email", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        order_id: orderId,
        error_code: "EMAIL_SEND_FAILED",
        error: toUserError(error),
      },
      { status: 500 }
    );
  }
}
