import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { parseManualFulfillBody } from "@/lib/inventory";
import { manualFulfillOrderByEmail } from "@/lib/inventory-manual-fulfill";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function httpStatusForError(errorCode: string | undefined): number {
  switch (errorCode) {
    case "ORDER_NOT_FOUND":
      return 404;
    case "INVENTORY_ALREADY_ASSIGNED":
    case "ALREADY_DELIVERED":
      return 409;
    case "ORDER_NOT_PAID":
    case "ORDER_NOT_ELIGIBLE":
    case "MISSING_CUSTOMER_EMAIL":
    case "NO_ORDER_ITEM":
      return 422;
    default:
      return 500;
  }
}

/**
 * POST /api/admin/orders/manual-fulfill
 * Create assigned inventory + encrypted credentials, then email via Phase 6.5.
 * Never returns credentials.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  const body = await request.json().catch(() => null);
  const parsed = parseManualFulfillBody(body);

  if (!parsed.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        error_code: "VALIDATION_ERROR",
        error: parsed.error,
      },
      { status: 400 }
    );
  }

  try {
    const result = await manualFulfillOrderByEmail(parsed.value);

    if (result.ok && (result.status === "sent" || result.status === "already_sent")) {
      return NextResponse.json({
        ok: true,
        status: result.status,
        order_id: result.order_id,
        inventory_item_id: result.inventory_item_id,
        provider_message_id: result.provider_message_id ?? null,
        ...(result.idempotent ? { idempotent: true } : {}),
      });
    }

    if (result.ok && result.status === "in_progress") {
      return NextResponse.json({
        ok: true,
        status: "in_progress",
        order_id: result.order_id,
        inventory_item_id: result.inventory_item_id,
        idempotent: true,
      });
    }

    const status = httpStatusForError(result.error_code);
    return NextResponse.json(
      {
        ok: false,
        status: result.status === "blocked" ? "blocked" : "failed",
        order_id: result.order_id,
        inventory_item_id: result.inventory_item_id,
        error_code: result.error_code || "MANUAL_FULFILL_FAILED",
      },
      { status }
    );
  } catch (error) {
    logServerError("admin orders manual-fulfill", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        order_id: parsed.value.order_id,
        error_code: "MANUAL_FULFILL_FAILED",
        error: toUserError(error),
      },
      { status: 500 }
    );
  }
}
