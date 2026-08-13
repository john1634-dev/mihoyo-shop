import "server-only";

import { getSupabaseService } from "@/lib/supabase-service";
import { logServerError } from "@/lib/errors";
import { isOrderEligibleForInventoryClaim } from "@/lib/inventory";

export { isOrderEligibleForInventoryClaim };

/** Result shape from claim_inventory_for_order (never includes credentials). */
export type InventoryClaimResult = {
  assigned: boolean;
  idempotent?: boolean;
  inventory_item_id?: string;
  product_id?: string;
  order_id?: string;
  order_item_id?: string | null;
  status?: string;
  assigned_at?: string;
  reason?: string;
};

function parseClaimResult(raw: unknown): InventoryClaimResult {
  if (!raw || typeof raw !== "object") {
    return { assigned: false, reason: "INVALID_RPC_RESULT" };
  }

  const row = raw as Record<string, unknown>;
  return {
    assigned: row.assigned === true,
    idempotent: row.idempotent === true ? true : undefined,
    inventory_item_id:
      typeof row.inventory_item_id === "string" ? row.inventory_item_id : undefined,
    product_id: typeof row.product_id === "string" ? row.product_id : undefined,
    order_id: typeof row.order_id === "string" ? row.order_id : undefined,
    order_item_id:
      typeof row.order_item_id === "string" ? row.order_item_id : null,
    status: typeof row.status === "string" ? row.status : undefined,
    assigned_at:
      typeof row.assigned_at === "string" ? row.assigned_at : undefined,
    reason: typeof row.reason === "string" ? row.reason : undefined,
  };
}

/**
 * Atomically claim one available inventory unit for a paid order.
 * Uses claim_inventory_for_order (service_role). Never decrypts credentials.
 * Does not change products.status or auto-fulfill.
 */
export async function claimInventoryForOrder(input: {
  orderId: string;
  productId?: string | null;
}): Promise<InventoryClaimResult> {
  const service = getSupabaseService();

  const { data: order, error: orderError } = await service
    .from("orders")
    .select("id,status,order_status,payment_status")
    .eq("id", input.orderId)
    .maybeSingle();

  if (orderError) {
    logServerError("inventory claim order load", orderError);
    return { assigned: false, reason: "ORDER_LOOKUP_FAILED" };
  }

  if (!order) {
    return { assigned: false, reason: "ORDER_NOT_FOUND" };
  }

  // Idempotent path: if already linked, return without re-checking eligibility.
  const { data: existing, error: existingError } = await service
    .from("inventory_items")
    .select("id,product_id,order_id,order_item_id,status,assigned_at")
    .eq("order_id", input.orderId)
    .limit(1)
    .maybeSingle();

  if (
    existingError &&
    !/relation|schema cache|does not exist|PGRST/i.test(existingError.message)
  ) {
    logServerError("inventory claim existing lookup", existingError);
  }

  if (existing) {
    return {
      assigned: true,
      idempotent: true,
      inventory_item_id: existing.id,
      product_id: existing.product_id,
      order_id: existing.order_id,
      order_item_id: existing.order_item_id,
      status: existing.status,
      assigned_at: existing.assigned_at ?? undefined,
    };
  }

  const eligibility = isOrderEligibleForInventoryClaim(order);
  if (!eligibility.ok) {
    return {
      assigned: false,
      reason: eligibility.reason,
      order_id: input.orderId,
    };
  }

  const rpcArgs: { p_order_id: string; p_product_id?: string } = {
    p_order_id: input.orderId,
  };
  if (input.productId) {
    rpcArgs.p_product_id = input.productId;
  }

  const { data, error } = await service.rpc("claim_inventory_for_order", rpcArgs);

  if (error) {
    if (
      /Could not find the function|schema cache|does not exist|PGRST202|42883/i.test(
        error.message
      )
    ) {
      return { assigned: false, reason: "CLAIM_RPC_UNAVAILABLE" };
    }
    logServerError("inventory claim rpc", error);
    return { assigned: false, reason: "CLAIM_RPC_FAILED" };
  }

  return parseClaimResult(data);
}

/**
 * Webhook-safe assignment after payment succeeds.
 * Never throws for no-stock; never reveals credentials.
 */
export async function assignInventoryAfterPayment(input: {
  orderId: string;
  productId?: string | null;
}): Promise<InventoryClaimResult> {
  try {
    const result = await claimInventoryForOrder(input);

    console.info("[inventory.assign]", {
      order_id: input.orderId,
      product_id: input.productId ?? null,
      assigned: result.assigned,
      idempotent: result.idempotent ?? false,
      inventory_item_id: result.inventory_item_id ?? null,
      reason: result.reason ?? null,
    });

    return result;
  } catch (error) {
    logServerError("inventory assign after payment", error);
    return {
      assigned: false,
      reason: "ASSIGN_EXCEPTION",
      order_id: input.orderId,
    };
  }
}
