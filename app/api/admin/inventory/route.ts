import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { encryptInventoryCredentials } from "@/lib/inventory-crypto";
import {
  INVENTORY_ITEM_SELECT,
  INVENTORY_STATUSES,
  isInventoryStatus,
  isValidUuid,
  parseCreateInventoryBody,
  parseUpdateInventoryBody,
  parseVoidInventoryBody,
  toPublicInventoryItem,
} from "@/lib/inventory";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { getSupabaseService } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/inventory
 * List inventory metadata only — never credentials.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";

  if (productId && !isValidUuid(productId)) {
    return NextResponse.json({ error: "Invalid product filter." }, { status: 400 });
  }

  if (status && !isInventoryStatus(status)) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }

  let query = admin.client
    .from("inventory_items")
    .select(INVENTORY_ITEM_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);

  if (productId) {
    query = query.eq("product_id", productId);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    logServerError("admin inventory GET", error);
    return NextResponse.json(
      { error: toUserError(error.message) },
      { status: 500 }
    );
  }

  return NextResponse.json({
    items: (data || []).map((row) => toPublicInventoryItem(row)),
    statuses: INVENTORY_STATUSES,
  });
}

/**
 * POST /api/admin/inventory
 * Create inventory item (admin client) + encrypted credentials (service role).
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  const body = await request.json().catch(() => null);
  const parsed = parseCreateInventoryBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const input = parsed.value;

  const { data: product, error: productError } = await admin.client
    .from("products")
    .select("id")
    .eq("id", input.product_id)
    .maybeSingle();

  if (productError) {
    logServerError("admin inventory POST product lookup", productError);
    return NextResponse.json(
      { error: toUserError(productError.message) },
      { status: 500 }
    );
  }

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: item, error: itemError } = await admin.client
    .from("inventory_items")
    .insert({
      product_id: input.product_id,
      status: "available",
      label: input.label,
      game_uid_hint: input.game_uid_hint,
      notes_internal: input.notes_internal,
      created_by: admin.user.id,
      created_at: now,
      updated_at: now,
    })
    .select(INVENTORY_ITEM_SELECT)
    .single();

  if (itemError || !item) {
    logServerError("admin inventory POST item insert", itemError);
    return NextResponse.json(
      { error: toUserError(itemError?.message || "Create failed.") },
      { status: 500 }
    );
  }

  const service = getSupabaseService();

  try {
    const encrypted = encryptInventoryCredentials({
      login: input.login,
      password: input.password,
      email: input.email,
      extra: input.extra,
    });

    const { error: credError } = await service.from("inventory_credentials").insert({
      inventory_item_id: item.id,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      key_version: encrypted.key_version,
      schema_version: encrypted.schema_version,
    });

    if (credError) {
      await service.from("inventory_items").delete().eq("id", item.id);
      logServerError("admin inventory POST credential insert", credError);
      return NextResponse.json(
        { error: "Failed to store encrypted credentials." },
        { status: 500 }
      );
    }
  } catch (err) {
    await service.from("inventory_items").delete().eq("id", item.id);
    logServerError("admin inventory POST encrypt", err);
    return NextResponse.json(
      { error: toUserError(err instanceof Error ? err.message : "Encryption failed.") },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { item: toPublicInventoryItem(item) },
    { status: 201 }
  );
}

/**
 * PATCH /api/admin/inventory
 * Update safe metadata or void an available item.
 */
export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  const body = await request.json().catch(() => null);

  if (body && typeof body === "object" && (body as { void?: boolean }).void === true) {
    const parsed = parseVoidInventoryBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { data: existing, error: loadError } = await admin.client
      .from("inventory_items")
      .select("id,status,order_id")
      .eq("id", parsed.id)
      .maybeSingle();

    if (loadError) {
      logServerError("admin inventory PATCH void load", loadError);
      return NextResponse.json(
        { error: toUserError(loadError.message) },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    }

    if (existing.status !== "available" || existing.order_id) {
      return NextResponse.json(
        { error: "Only unassigned available stock can be voided." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { data: item, error: voidError } = await admin.client
      .from("inventory_items")
      .update({ status: "void", updated_at: now })
      .eq("id", parsed.id)
      .select(INVENTORY_ITEM_SELECT)
      .single();

    if (voidError || !item) {
      logServerError("admin inventory PATCH void", voidError);
      return NextResponse.json(
        { error: toUserError(voidError?.message || "Void failed.") },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: toPublicInventoryItem(item) });
  }

  const parsed = parseUpdateInventoryBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data: existing, error: loadError } = await admin.client
    .from("inventory_items")
    .select("id,status")
    .eq("id", parsed.value.id)
    .maybeSingle();

  if (loadError) {
    logServerError("admin inventory PATCH load", loadError);
    return NextResponse.json(
      { error: toUserError(loadError.message) },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
  }

  if (existing.status === "void" || existing.status === "consumed") {
    return NextResponse.json(
      { error: "Cannot edit metadata for void or consumed stock." },
      { status: 409 }
    );
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(parsed.value, "label")) {
    update.label = parsed.value.label ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(parsed.value, "game_uid_hint")) {
    update.game_uid_hint = parsed.value.game_uid_hint ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(parsed.value, "notes_internal")) {
    update.notes_internal = parsed.value.notes_internal ?? null;
  }

  const { data: item, error: updateError } = await admin.client
    .from("inventory_items")
    .update(update)
    .eq("id", parsed.value.id)
    .select(INVENTORY_ITEM_SELECT)
    .single();

  if (updateError || !item) {
    logServerError("admin inventory PATCH update", updateError);
    return NextResponse.json(
      { error: toUserError(updateError?.message || "Update failed.") },
      { status: 500 }
    );
  }

  return NextResponse.json({ item: toPublicInventoryItem(item) });
}
