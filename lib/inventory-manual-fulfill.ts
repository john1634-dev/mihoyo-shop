import "server-only";

import { logServerError } from "@/lib/errors";
import { encryptInventoryCredentials } from "@/lib/inventory-crypto";
import {
  deliverInventoryByEmail,
  emailDeliveryIdempotencyKey,
  type InventoryEmailDeliveryResult,
} from "@/lib/inventory-delivery";
import type { ManualFulfillInput } from "@/lib/inventory";
import { getSupabaseService } from "@/lib/supabase-service";

export type ManualFulfillResult = {
  ok: boolean;
  status: string;
  order_id: string;
  inventory_item_id?: string;
  provider_message_id?: string | null;
  error_code?: string;
  idempotent?: boolean;
};

/** Pure eligibility gate for manual fulfillment (testable). */
export function evaluateManualFulfillEligibility(input: {
  order: {
    payment_status?: string | null;
    status?: string | null;
    order_status?: string | null;
    customer_email?: string | null;
  } | null;
  existingInventory: { id: string } | null;
  emailAlreadySent: boolean;
}): { ok: true } | { ok: false; error_code: string } {
  if (!input.order) {
    return { ok: false, error_code: "ORDER_NOT_FOUND" };
  }

  const status = (
    input.order.status ||
    input.order.order_status ||
    ""
  ).toLowerCase();

  if (status === "cancelled" || status === "refunded") {
    return { ok: false, error_code: "ORDER_NOT_ELIGIBLE" };
  }

  if (
    input.order.payment_status === "failed" ||
    input.order.payment_status === "refunded"
  ) {
    return { ok: false, error_code: "ORDER_NOT_ELIGIBLE" };
  }

  if (input.order.payment_status !== "paid") {
    return { ok: false, error_code: "ORDER_NOT_PAID" };
  }

  if (!(input.order.customer_email || "").trim()) {
    return { ok: false, error_code: "MISSING_CUSTOMER_EMAIL" };
  }

  if (input.emailAlreadySent) {
    return { ok: false, error_code: "ALREADY_DELIVERED" };
  }

  if (input.existingInventory) {
    return { ok: false, error_code: "INVENTORY_ALREADY_ASSIGNED" };
  }

  return { ok: true };
}

function toManualResult(
  orderId: string,
  delivery: InventoryEmailDeliveryResult,
  inventoryItemId?: string
): ManualFulfillResult {
  if (delivery.status === "sent") {
    return {
      ok: true,
      status: "sent",
      order_id: orderId,
      inventory_item_id: delivery.inventory_item_id ?? inventoryItemId,
      provider_message_id: delivery.provider_message_id ?? null,
    };
  }

  if (delivery.status === "already_sent") {
    return {
      ok: true,
      status: "already_sent",
      order_id: orderId,
      inventory_item_id: delivery.inventory_item_id ?? inventoryItemId,
      provider_message_id: delivery.provider_message_id ?? null,
      idempotent: true,
    };
  }

  if (delivery.status === "in_progress") {
    return {
      ok: true,
      status: "in_progress",
      order_id: orderId,
      inventory_item_id: delivery.inventory_item_id ?? inventoryItemId,
      idempotent: true,
    };
  }

  return {
    ok: false,
    status: delivery.status === "blocked" ? "blocked" : "failed",
    order_id: orderId,
    inventory_item_id: delivery.inventory_item_id ?? inventoryItemId,
    error_code: delivery.error_code || "EMAIL_SEND_FAILED",
  };
}

type ManualFulfillDeps = {
  deliverEmail?: (orderId: string) => Promise<InventoryEmailDeliveryResult>;
};

/**
 * Create order-linked assigned inventory with encrypted credentials,
 * then deliver via the existing Phase 6.5 email service.
 * Never returns or logs decrypted credentials.
 */
export async function manualFulfillOrderByEmail(
  input: ManualFulfillInput,
  deps: ManualFulfillDeps = {}
): Promise<ManualFulfillResult> {
  const service = getSupabaseService();
  const orderId = input.order_id;
  const deliverEmail = deps.deliverEmail ?? deliverInventoryByEmail;

  const { data: order, error: orderError } = await service
    .from("orders")
    .select(
      "id,order_number,customer_email,status,order_status,payment_status,fulfilled_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    logServerError("manual fulfill order load", orderError);
    return {
      ok: false,
      status: "blocked",
      order_id: orderId,
      error_code: "ORDER_LOOKUP_FAILED",
    };
  }

  const { data: existingInventory } = await service
    .from("inventory_items")
    .select("id,status")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  const idempotencyKey = emailDeliveryIdempotencyKey(orderId);
  const { data: existingDelivery } = await service
    .from("delivery_attempts")
    .select("id,status,provider_message_id,inventory_item_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  const emailAlreadySent = existingDelivery?.status === "sent";

  const eligibility = evaluateManualFulfillEligibility({
    order,
    existingInventory: existingInventory ?? null,
    emailAlreadySent,
  });

  if (!eligibility.ok) {
    if (eligibility.error_code === "ALREADY_DELIVERED") {
      return {
        ok: true,
        status: "already_sent",
        order_id: orderId,
        inventory_item_id: existingDelivery?.inventory_item_id ?? existingInventory?.id,
        provider_message_id: existingDelivery?.provider_message_id ?? null,
        idempotent: true,
      };
    }

    return {
      ok: false,
      status: "blocked",
      order_id: orderId,
      inventory_item_id: existingInventory?.id,
      error_code: eligibility.error_code,
    };
  }

  const { data: orderItem, error: itemError } = await service
    .from("order_items")
    .select("id,product_id")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (itemError) {
    logServerError("manual fulfill order item load", itemError);
    return {
      ok: false,
      status: "blocked",
      order_id: orderId,
      error_code: "ORDER_ITEM_LOOKUP_FAILED",
    };
  }

  if (!orderItem?.product_id) {
    return {
      ok: false,
      status: "blocked",
      order_id: orderId,
      error_code: "NO_ORDER_ITEM",
    };
  }

  const now = new Date().toISOString();
  const { data: inventoryItem, error: inventoryError } = await service
    .from("inventory_items")
    .insert({
      product_id: orderItem.product_id,
      status: "assigned",
      order_id: orderId,
      order_item_id: orderItem.id,
      assigned_at: now,
      label: input.label,
      game_uid_hint: input.game_uid_hint,
      notes_internal: input.notes_internal,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (inventoryError || !inventoryItem) {
    if (
      inventoryError &&
      (inventoryError.code === "23505" ||
        /duplicate key|unique constraint/i.test(inventoryError.message))
    ) {
      return {
        ok: false,
        status: "blocked",
        order_id: orderId,
        error_code: "INVENTORY_ALREADY_ASSIGNED",
      };
    }

    logServerError("manual fulfill inventory insert", inventoryError);
    return {
      ok: false,
      status: "failed",
      order_id: orderId,
      error_code: "INVENTORY_CREATE_FAILED",
    };
  }

  try {
    const encrypted = encryptInventoryCredentials({
      login: input.login,
      password: input.password,
      email: input.email,
      extra: input.extra,
    });

    const { error: credError } = await service.from("inventory_credentials").insert({
      inventory_item_id: inventoryItem.id,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      key_version: encrypted.key_version,
      schema_version: encrypted.schema_version,
    });

    if (credError) {
      await service.from("inventory_items").delete().eq("id", inventoryItem.id);
      logServerError("manual fulfill credential insert", {
        code: credError.code,
        message: "credential insert failed",
      });
      return {
        ok: false,
        status: "failed",
        order_id: orderId,
        error_code: "CREDENTIAL_STORE_FAILED",
      };
    }
  } catch (error) {
    await service.from("inventory_items").delete().eq("id", inventoryItem.id);
    logServerError("manual fulfill encrypt", {
      code: "ENCRYPT_FAILED",
      message: error instanceof Error ? error.message : "encrypt failed",
    });
    return {
      ok: false,
      status: "failed",
      order_id: orderId,
      error_code: "CREDENTIAL_STORE_FAILED",
    };
  }

  const delivery = await deliverEmail(orderId);

  console.info("[inventory.manual-fulfill]", {
    order_id: orderId,
    inventory_item_id: inventoryItem.id,
    delivery_status: delivery.status,
    error_code: delivery.error_code ?? null,
  });

  return toManualResult(orderId, delivery, inventoryItem.id);
}
