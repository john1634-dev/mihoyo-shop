import { isValidEmail, sanitizeText } from "@/lib/validation";

export const INVENTORY_STATUSES = [
  "available",
  "reserved",
  "assigned",
  "delivered",
  "consumed",
  "void",
] as const;

export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

/** Safe inventory metadata returned to the admin browser — never includes credentials. */
export type InventoryItemPublic = {
  id: string;
  product_id: string;
  product_title: string | null;
  status: InventoryStatus;
  order_id: string | null;
  label: string | null;
  game_uid_hint: string | null;
  notes_internal: string | null;
  created_at: string;
  updated_at: string;
  reserved_at: string | null;
  assigned_at: string | null;
  delivered_at: string | null;
  consumed_at: string | null;
};

export const INVENTORY_ITEM_SELECT = `
  id,
  product_id,
  status,
  order_id,
  label,
  game_uid_hint,
  notes_internal,
  created_at,
  updated_at,
  reserved_at,
  assigned_at,
  delivered_at,
  consumed_at,
  products ( title )
`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function isInventoryStatus(value: string): value is InventoryStatus {
  return (INVENTORY_STATUSES as readonly string[]).includes(value);
}

type InventoryRow = {
  id: string;
  product_id: string;
  status: string;
  order_id: string | null;
  label: string | null;
  game_uid_hint: string | null;
  notes_internal: string | null;
  created_at: string;
  updated_at: string;
  reserved_at: string | null;
  assigned_at: string | null;
  delivered_at: string | null;
  consumed_at: string | null;
  products?: { title: string } | { title: string }[] | null;
};

export function toPublicInventoryItem(row: InventoryRow): InventoryItemPublic {
  const product = row.products;
  const productTitle = Array.isArray(product)
    ? product[0]?.title ?? null
    : product?.title ?? null;

  return {
    id: row.id,
    product_id: row.product_id,
    product_title: productTitle,
    status: isInventoryStatus(row.status) ? row.status : "available",
    order_id: row.order_id,
    label: row.label,
    game_uid_hint: row.game_uid_hint,
    notes_internal: row.notes_internal,
    created_at: row.created_at,
    updated_at: row.updated_at,
    reserved_at: row.reserved_at,
    assigned_at: row.assigned_at,
    delivered_at: row.delivered_at,
    consumed_at: row.consumed_at,
  };
}

export type CreateInventoryInput = {
  product_id: string;
  label: string | null;
  game_uid_hint: string | null;
  notes_internal: string | null;
  login: string;
  password: string;
  email: string;
  extra: string;
};

export function parseCreateInventoryBody(
  body: unknown
): { ok: true; value: CreateInventoryInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }

  const raw = body as Record<string, unknown>;
  const productId =
    typeof raw.product_id === "string" ? raw.product_id.trim() : "";

  if (!isValidUuid(productId)) {
    return { ok: false, error: "A valid product is required." };
  }

  const login =
    typeof raw.login === "string" ? sanitizeText(raw.login, 200) : "";
  const password =
    typeof raw.password === "string" ? raw.password.slice(0, 500).trim() : "";

  if (!login) {
    return { ok: false, error: "Login is required." };
  }
  if (!password) {
    return { ok: false, error: "Password is required." };
  }

  const emailRaw =
    typeof raw.email === "string" ? sanitizeText(raw.email, 320) : "";
  if (emailRaw && !isValidEmail(emailRaw)) {
    return { ok: false, error: "Enter a valid email or leave it blank." };
  }

  return {
    ok: true,
    value: {
      product_id: productId,
      label:
        typeof raw.label === "string"
          ? sanitizeText(raw.label, 200) || null
          : null,
      game_uid_hint:
        typeof raw.game_uid_hint === "string"
          ? sanitizeText(raw.game_uid_hint, 120) || null
          : null,
      notes_internal:
        typeof raw.notes_internal === "string"
          ? sanitizeText(raw.notes_internal, 2000) || null
          : null,
      login,
      password,
      email: emailRaw,
      extra:
        typeof raw.extra === "string"
          ? sanitizeText(raw.extra, 2000)
          : "",
    },
  };
}

export type UpdateInventoryMetadataInput = {
  id: string;
  label?: string | null;
  game_uid_hint?: string | null;
  notes_internal?: string | null;
};

export function parseUpdateInventoryBody(
  body: unknown
): { ok: true; value: UpdateInventoryMetadataInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }

  const raw = body as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";

  if (!isValidUuid(id)) {
    return { ok: false, error: "A valid inventory item id is required." };
  }

  const hasLabel = Object.prototype.hasOwnProperty.call(raw, "label");
  const hasHint = Object.prototype.hasOwnProperty.call(raw, "game_uid_hint");
  const hasNotes = Object.prototype.hasOwnProperty.call(raw, "notes_internal");

  if (!hasLabel && !hasHint && !hasNotes) {
    return { ok: false, error: "No metadata fields to update." };
  }

  const value: UpdateInventoryMetadataInput = { id };

  if (hasLabel) {
    value.label =
      typeof raw.label === "string"
        ? sanitizeText(raw.label, 200) || null
        : null;
  }
  if (hasHint) {
    value.game_uid_hint =
      typeof raw.game_uid_hint === "string"
        ? sanitizeText(raw.game_uid_hint, 120) || null
        : null;
  }
  if (hasNotes) {
    value.notes_internal =
      typeof raw.notes_internal === "string"
        ? sanitizeText(raw.notes_internal, 2000) || null
        : null;
  }

  return { ok: true, value };
}

export function parseVoidInventoryBody(
  body: unknown
): { ok: true; id: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }

  const raw = body as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";

  if (!isValidUuid(id)) {
    return { ok: false, error: "A valid inventory item id is required." };
  }

  if (raw.void !== true) {
    return { ok: false, error: "Invalid void request." };
  }

  return { ok: true, id };
}

export type ManualFulfillInput = {
  order_id: string;
  login: string;
  password: string;
  email: string;
  extra: string;
  label: string | null;
  game_uid_hint: string | null;
  notes_internal: string | null;
};

export function parseManualFulfillBody(
  body: unknown
): { ok: true; value: ManualFulfillInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }

  const raw = body as Record<string, unknown>;
  const orderId =
    typeof raw.order_id === "string" ? raw.order_id.trim() : "";

  if (!isValidUuid(orderId)) {
    return { ok: false, error: "A valid order id is required." };
  }

  const login =
    typeof raw.login === "string" ? sanitizeText(raw.login, 200) : "";
  const password =
    typeof raw.password === "string" ? raw.password.slice(0, 500).trim() : "";

  if (!login) {
    return { ok: false, error: "Login is required." };
  }
  if (!password) {
    return { ok: false, error: "Password is required." };
  }

  const emailRaw =
    typeof raw.email === "string" ? sanitizeText(raw.email, 320) : "";
  if (emailRaw && !isValidEmail(emailRaw)) {
    return { ok: false, error: "Enter a valid email or leave it blank." };
  }

  return {
    ok: true,
    value: {
      order_id: orderId,
      label:
        typeof raw.label === "string"
          ? sanitizeText(raw.label, 200) || null
          : null,
      game_uid_hint:
        typeof raw.game_uid_hint === "string"
          ? sanitizeText(raw.game_uid_hint, 120) || null
          : null,
      notes_internal:
        typeof raw.notes_internal === "string"
          ? sanitizeText(raw.notes_internal, 2000) || null
          : null,
      login,
      password,
      email: emailRaw,
      extra:
        typeof raw.extra === "string"
          ? sanitizeText(raw.extra, 2000)
          : "",
    },
  };
}

const TERMINAL_BLOCKED_STATUSES = new Set([
  "failed",
  "cancelled",
  "refunded",
]);

const PAID_FLOW_STATUSES = new Set([
  "paid",
  "sourcing",
  "fulfilled",
  "processing",
  "completed",
]);

/**
 * App-layer gate for Phase 6.4 inventory claims.
 * New claims require payment_status=paid (or paid-flow status).
 * Never for failed / cancelled / refunded.
 */
export function isOrderEligibleForInventoryClaim(order: {
  payment_status?: string | null;
  status?: string | null;
  order_status?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const status = (order.status || order.order_status || "").toLowerCase();
  const payment = (order.payment_status || "").toLowerCase();

  if (TERMINAL_BLOCKED_STATUSES.has(status)) {
    return { ok: false, reason: "ORDER_NOT_ELIGIBLE" };
  }

  if (payment === "failed" || payment === "refunded") {
    return { ok: false, reason: "ORDER_NOT_ELIGIBLE" };
  }

  if (payment === "paid" || PAID_FLOW_STATUSES.has(status)) {
    return { ok: true };
  }

  return { ok: false, reason: "ORDER_NOT_PAID" };
}

/**
 * In-memory model of claim_inventory_for_order concurrency.
 * Mirrors SELECT ... FOR UPDATE SKIP LOCKED + idempotent order binding.
 */
export function simulateConcurrentInventoryClaims(input: {
  inventoryIds: string[];
  orderIds: string[];
}): Array<{
  orderId: string;
  assigned: boolean;
  inventoryItemId: string | null;
  reason?: string;
}> {
  const pool = input.inventoryIds.map((id) => ({
    id,
    status: "available" as "available" | "assigned",
    orderId: null as string | null,
  }));
  const byOrder = new Map<string, string>();
  const results: Array<{
    orderId: string;
    assigned: boolean;
    inventoryItemId: string | null;
    reason?: string;
  }> = [];

  for (const orderId of input.orderIds) {
    const existing = byOrder.get(orderId);
    if (existing) {
      results.push({
        orderId,
        assigned: true,
        inventoryItemId: existing,
        reason: "idempotent",
      });
      continue;
    }

    const item = pool.find((row) => row.status === "available" && row.orderId === null);
    if (!item) {
      results.push({
        orderId,
        assigned: false,
        inventoryItemId: null,
        reason: "NO_INVENTORY",
      });
      continue;
    }

    item.status = "assigned";
    item.orderId = orderId;
    byOrder.set(orderId, item.id);
    results.push({
      orderId,
      assigned: true,
      inventoryItemId: item.id,
    });
  }

  return results;
}
