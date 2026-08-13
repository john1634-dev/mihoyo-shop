/**
 * Phase 6.4 — inventory assignment regression (local, no migration execution).
 *
 * Always runs:
 *   - eligibility gates
 *   - concurrency / idempotency simulation (SKIP LOCKED model)
 *   - products.status invariance (logic)
 *   - webhook source checks (no auto-fulfill / no credential reveal)
 *
 * Optionally runs against live Supabase if inventory tables + RPC exist:
 *   - unpaid/cancelled/refunded/failed cannot claim
 *   - paid claim + duplicate claim
 *   - concurrent claims
 *   - products.status unchanged
 *
 * Run: node --import tsx scripts/_phase64-inventory-assign.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  isOrderEligibleForInventoryClaim,
  simulateConcurrentInventoryClaims,
} from "../lib/inventory.ts";

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

function loadEnv() {
  if (!existsSync(".env.local")) return {};
  const env = readFileSync(".env.local", "utf8");
  const get = (k) => {
    const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  return {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

// ─── Local unit checks (always) ─────────────────────────────────────────────

function runLocalEligibility() {
  const cases = [
    [{ payment_status: "pending", status: "pending" }, false, "ORDER_NOT_PAID"],
    [{ payment_status: "failed", status: "failed" }, false, "ORDER_NOT_ELIGIBLE"],
    [{ payment_status: "paid", status: "cancelled" }, false, "ORDER_NOT_ELIGIBLE"],
    [{ payment_status: "refunded", status: "refunded" }, false, "ORDER_NOT_ELIGIBLE"],
    [{ payment_status: "failed", status: "paid" }, false, "ORDER_NOT_ELIGIBLE"],
    [{ payment_status: "paid", status: "pending" }, true, null],
    [{ payment_status: "paid", status: "paid" }, true, null],
    [{ payment_status: "paid", status: "sourcing" }, true, null],
    [{ payment_status: "paid", status: "fulfilled" }, true, null],
  ];

  for (const [order, ok, reason] of cases) {
    const result = isOrderEligibleForInventoryClaim(order);
    const label = `${order.payment_status}/${order.status}`;
    if (ok) {
      if (result.ok) pass(`eligible_${label}`);
      else fail(`eligible_${label}`, result.reason);
    } else if (!result.ok && result.reason === reason) {
      pass(`blocked_${label}`, reason);
    } else {
      fail(`blocked_${label}`, JSON.stringify(result));
    }
  }
}

function runLocalConcurrency() {
  const first = simulateConcurrentInventoryClaims({
    inventoryIds: ["inv-001"],
    orderIds: ["order-a", "order-b"],
  });

  assert.equal(first[0].assigned, true);
  assert.equal(first[0].inventoryItemId, "inv-001");
  assert.equal(first[1].assigned, false);
  assert.equal(first[1].reason, "NO_INVENTORY");
  pass("concurrent_one_unit", "A=inv-001 B=NO_INVENTORY");

  const second = simulateConcurrentInventoryClaims({
    inventoryIds: ["inv-001", "inv-002"],
    orderIds: ["order-a", "order-b"],
  });
  assert.equal(second[0].inventoryItemId, "inv-001");
  assert.equal(second[1].inventoryItemId, "inv-002");
  pass("concurrent_two_units", "A=001 B=002");

  const idem = simulateConcurrentInventoryClaims({
    inventoryIds: ["inv-001"],
    orderIds: ["order-a", "order-a"],
  });
  assert.equal(idem[0].inventoryItemId, "inv-001");
  assert.equal(idem[1].inventoryItemId, "inv-001");
  assert.equal(idem[1].reason, "idempotent");
  pass("idempotent_double_claim", "same inv-001 twice");

  const assigned = new Set(
    second.filter((r) => r.assigned).map((r) => r.inventoryItemId)
  );
  assert.equal(assigned.size, 2);
  pass("no_double_assign_same_unit");
}

function runSourceGuards() {
  const webhook = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
  const assign = readFileSync("lib/inventory-assign.ts", "utf8");
  const sql = readFileSync(
    "supabase/phase6_4_inventory_assignment.sql",
    "utf8"
  );

  if (webhook.includes("assignInventoryAfterPayment")) {
    pass("webhook_calls_assign");
  } else {
    fail("webhook_calls_assign");
  }

  if (
    webhook.includes("status: \"fulfilled\"") &&
    /assignInventoryAfterPayment[\s\S]{0,200}fulfilled/.test(webhook)
  ) {
    fail("no_auto_fulfill", "webhook appears to fulfill after assign");
  } else {
    pass("no_auto_fulfill");
  }

  if (!webhook.includes("decryptInventoryCredentials")) {
    pass("webhook_no_decrypt");
  } else {
    fail("webhook_no_decrypt");
  }

  if (
    !assign.includes("decryptInventoryCredentials") &&
    !/password|ciphertext|nonce/.test(
      assign.split("console.info")[1]?.slice(0, 400) || ""
    )
  ) {
    pass("assign_logs_safe");
  } else {
    fail("assign_logs_safe");
  }

  if (
    sql.includes("FOR UPDATE SKIP LOCKED") &&
    sql.includes("ORDER_NOT_PAID") &&
    sql.includes("ORDER_NOT_ELIGIBLE") &&
    !sql.includes("products.status")
  ) {
    pass("rpc_hardening_sql");
  } else if (
    sql.includes("FOR UPDATE SKIP LOCKED") &&
    sql.includes("ORDER_NOT_PAID") &&
    sql.includes("ORDER_NOT_ELIGIBLE")
  ) {
    // Comment may mention products.status — ensure UPDATE doesn't touch products
    if (!/UPDATE\s+public\.products/i.test(sql)) {
      pass("rpc_hardening_sql");
    } else {
      fail("rpc_hardening_sql", "updates products");
    }
  } else {
    fail("rpc_hardening_sql");
  }

  // products.status must remain available after assignment (invariant documented)
  if (
    !/UPDATE\s+.*products.*status\s*=\s*['\"]sold['\"]/i.test(webhook) &&
    webhook.includes("assignInventoryAfterPayment")
  ) {
    pass("products_status_unchanged_logic");
  } else {
    fail("products_status_unchanged_logic");
  }
}

async function inventoryReady(sb) {
  const { error } = await sb.from("inventory_items").select("id").limit(1);
  if (error) return false;
  const { error: rpcError } = await sb.rpc("claim_inventory_for_order", {
    p_order_id: "00000000-0000-0000-0000-000000000000",
  });
  // Missing function → not ready. ORDER_NOT_FOUND / similar → ready.
  if (rpcError && /Could not find the function|PGRST202|42883/i.test(rpcError.message)) {
    return false;
  }
  return true;
}

async function runLiveChecks(sb) {
  const { data: product } = await sb
    .from("products")
    .select("id,status,title")
    .eq("status", "available")
    .limit(1)
    .maybeSingle();

  if (!product) {
    fail("live_setup", "no available product");
    return;
  }

  const productStatusBefore = product.status;
  const stamp = Date.now();

  async function createOrder(status, paymentStatus) {
    const { data: order, error } = await sb
      .from("orders")
      .insert({
        order_number: `P64-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
        customer_email: `phase64-${stamp}@example.com`,
        status,
        order_status: status,
        payment_status: paymentStatus,
        currency: "MYR",
        total_amount: 1,
        total: 1,
        subtotal: 1,
        channel: "stripe",
      })
      .select("id")
      .single();
    if (error) throw error;

    const { data: item, error: itemError } = await sb
      .from("order_items")
      .insert({
        order_id: order.id,
        product_id: product.id,
        product_title: product.title || "Phase 6.4 test",
        price: 1,
        unit_price: 1,
        quantity: 1,
        subtotal: 1,
      })
      .select("id")
      .single();
    if (itemError) throw itemError;

    return { orderId: order.id, orderItemId: item.id };
  }

  async function cleanup(orderIds, inventoryIds) {
    if (inventoryIds.length) {
      await sb.from("inventory_items").delete().in("id", inventoryIds);
    }
    if (orderIds.length) {
      await sb.from("order_items").delete().in("order_id", orderIds);
      await sb.from("orders").delete().in("id", orderIds);
    }
  }

  const orderIds = [];
  const inventoryIds = [];

  try {
    // Blocked statuses
    for (const [status, payment] of [
      ["pending", "pending"],
      ["failed", "failed"],
      ["cancelled", "failed"],
      ["refunded", "refunded"],
    ]) {
      const { orderId } = await createOrder(status, payment);
      orderIds.push(orderId);
      const { data } = await sb.rpc("claim_inventory_for_order", {
        p_order_id: orderId,
        p_product_id: product.id,
      });
      if (data?.assigned === true) {
        fail(`live_block_${status}`, "unexpectedly assigned");
      } else {
        pass(`live_block_${status}`, data?.reason || "blocked");
      }
    }

    // Create one inventory unit
    const { data: inv1, error: inv1Error } = await sb
      .from("inventory_items")
      .insert({
        product_id: product.id,
        status: "available",
        label: `p64-${stamp}-001`,
      })
      .select("id")
      .single();
    if (inv1Error) throw inv1Error;
    inventoryIds.push(inv1.id);

    const paidA = await createOrder("paid", "paid");
    orderIds.push(paidA.orderId);
    const paidB = await createOrder("paid", "paid");
    orderIds.push(paidB.orderId);

    const [claimA, claimB] = await Promise.all([
      sb.rpc("claim_inventory_for_order", {
        p_order_id: paidA.orderId,
        p_product_id: product.id,
      }),
      sb.rpc("claim_inventory_for_order", {
        p_order_id: paidB.orderId,
        p_product_id: product.id,
      }),
    ]);

    const aAssigned = claimA.data?.assigned === true;
    const bAssigned = claimB.data?.assigned === true;
    if (aAssigned !== bAssigned) {
      pass(
        "live_concurrent_one_unit",
        aAssigned
          ? `A=${claimA.data.inventory_item_id} B=${claimB.data?.reason}`
          : `B=${claimB.data.inventory_item_id} A=${claimA.data?.reason}`
      );
    } else {
      fail(
        "live_concurrent_one_unit",
        `A=${JSON.stringify(claimA.data)} B=${JSON.stringify(claimB.data)}`
      );
    }

    const winnerOrder = aAssigned ? paidA.orderId : paidB.orderId;
    const winnerId = aAssigned
      ? claimA.data.inventory_item_id
      : claimB.data.inventory_item_id;
    const loserOrder = aAssigned ? paidB.orderId : paidA.orderId;

    const replay = await sb.rpc("claim_inventory_for_order", {
      p_order_id: winnerOrder,
      p_product_id: product.id,
    });
    if (
      replay.data?.assigned === true &&
      replay.data?.inventory_item_id === winnerId &&
      replay.data?.idempotent === true
    ) {
      pass("live_idempotent_replay", winnerId);
    } else {
      fail("live_idempotent_replay", JSON.stringify(replay.data));
    }

    const { count } = await sb
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", winnerOrder);
    if (count === 1) pass("live_one_item_per_order");
    else fail("live_one_item_per_order", `count=${count}`);

    // Add second unit → loser should claim it
    const { data: inv2, error: inv2Error } = await sb
      .from("inventory_items")
      .insert({
        product_id: product.id,
        status: "available",
        label: `p64-${stamp}-002`,
      })
      .select("id")
      .single();
    if (inv2Error) throw inv2Error;
    inventoryIds.push(inv2.id);

    const claimLoser = await sb.rpc("claim_inventory_for_order", {
      p_order_id: loserOrder,
      p_product_id: product.id,
    });
    if (
      claimLoser.data?.assigned === true &&
      claimLoser.data?.inventory_item_id === inv2.id
    ) {
      pass("live_second_unit_for_loser", inv2.id);
    } else {
      fail("live_second_unit_for_loser", JSON.stringify(claimLoser.data));
    }

    const { data: productAfter } = await sb
      .from("products")
      .select("status")
      .eq("id", product.id)
      .single();
    if (productAfter?.status === productStatusBefore) {
      pass("live_products_status_unchanged", productAfter.status);
    } else {
      fail(
        "live_products_status_unchanged",
        `${productStatusBefore} → ${productAfter?.status}`
      );
    }

    // No-stock after both claimed
    const paidC = await createOrder("paid", "paid");
    orderIds.push(paidC.orderId);
    const noStock = await sb.rpc("claim_inventory_for_order", {
      p_order_id: paidC.orderId,
      p_product_id: product.id,
    });
    if (noStock.data?.assigned === false && noStock.data?.reason === "NO_INVENTORY") {
      pass("live_no_inventory");
    } else {
      fail("live_no_inventory", JSON.stringify(noStock.data));
    }
  } catch (err) {
    fail("live_checks", err instanceof Error ? err.message : String(err));
  } finally {
    await cleanup(orderIds, inventoryIds);
  }
}

async function main() {
  runLocalEligibility();
  runLocalConcurrency();
  runSourceGuards();

  const env = loadEnv();
  if (!env.url || !env.serviceKey) {
    pass("live_skipped", "no .env.local service credentials");
  } else {
    const sb = createClient(env.url, env.serviceKey, {
      auth: { persistSession: false },
    });
    const ready = await inventoryReady(sb);
    if (!ready) {
      pass(
        "live_skipped",
        "inventory tables/RPC not applied yet (expected until migrations run)"
      );
    } else {
      await runLiveChecks(sb);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nPhase 6.4 inventory-assign: ${results.length - failed.length}/${results.length} passed`
  );
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
