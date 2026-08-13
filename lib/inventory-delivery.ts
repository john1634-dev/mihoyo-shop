import "server-only";

import {
  SITE_NAME,
  WHATSAPP_DISPLAY,
  WHATSAPP_URL,
  resolveSiteUrl,
} from "@/lib/config";
import { sendTransactionalEmail, type SendEmailResult } from "@/lib/email";
import { logServerError } from "@/lib/errors";
import {
  decryptInventoryCredentials,
  type InventoryCredentialPayload,
} from "@/lib/inventory-crypto";
import { getSupabaseService } from "@/lib/supabase-service";

export const EMAIL_DELIVERY_CHANNEL = "email";
export const EMAIL_IDEMPOTENCY_VERSION = "v1";

export type InventoryEmailDeliveryStatus =
  | "sent"
  | "already_sent"
  | "failed"
  | "blocked"
  | "in_progress";

export type InventoryEmailDeliveryResult = {
  ok: boolean;
  status: InventoryEmailDeliveryStatus;
  order_id: string;
  inventory_item_id?: string;
  provider_message_id?: string | null;
  error_code?: string;
  idempotent?: boolean;
};

export function emailDeliveryIdempotencyKey(orderId: string): string {
  return `${orderId}:email:${EMAIL_IDEMPOTENCY_VERSION}`;
}

/** Pure eligibility gate used by deliverInventoryByEmail and tests. */
export function evaluateEmailDeliveryEligibility(input: {
  order: {
    payment_status?: string | null;
    status?: string | null;
    order_status?: string | null;
    customer_email?: string | null;
  } | null;
  inventory: { status?: string | null } | null;
  hasCredentials: boolean;
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
  if (!input.inventory) {
    return { ok: false, error_code: "NO_ASSIGNED_INVENTORY" };
  }
  if (
    input.inventory.status === "void" ||
    input.inventory.status === "consumed"
  ) {
    return { ok: false, error_code: "INVENTORY_NOT_ELIGIBLE" };
  }
  if (
    input.inventory.status !== "assigned" &&
    input.inventory.status !== "delivered"
  ) {
    return { ok: false, error_code: "INVENTORY_NOT_ASSIGNED" };
  }
  if (!input.hasCredentials) {
    return { ok: false, error_code: "MISSING_CREDENTIALS" };
  }
  return { ok: true };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortOrderLabel(order: {
  id: string;
  order_number?: string | null;
}): string {
  if (order.order_number?.trim()) return order.order_number.trim();
  return order.id.slice(0, 8).toUpperCase();
}

export function buildInventoryDeliveryEmail(input: {
  orderLabel: string;
  productTitle: string;
  credentials: InventoryCredentialPayload;
}): { subject: string; html: string; text: string } {
  const subject = `Your Game Account Order — #${input.orderLabel}`;
  const site = resolveSiteUrl();
  const login = input.credentials.login;
  const password = input.credentials.password;
  const accountEmail = input.credentials.email || "—";
  const extra = input.credentials.extra?.trim() || "";

  const textLines = [
    `${SITE_NAME} — Account delivery`,
    "",
    `Order: #${input.orderLabel}`,
    `Product: ${input.productTitle}`,
    "",
    "Your game account details:",
    `Login: ${login}`,
    `Password: ${password}`,
    `Account email: ${accountEmail}`,
    ...(extra ? [`Extra: ${extra}`] : []),
    "",
    "Security:",
    "- Change the password after first login when possible.",
    "- Do not share these credentials with anyone.",
    "- We will never ask for your payment card details by email.",
    "",
    `Support: WhatsApp ${WHATSAPP_DISPLAY} (${WHATSAPP_URL})`,
    site,
  ];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 8px;">
              <p style="margin:0;font-size:13px;color:#94a3b8;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(SITE_NAME)}</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#f8fafc;">Your game account is ready</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 0;font-size:14px;color:#cbd5e1;line-height:1.6;">
              <p style="margin:0 0 8px;"><strong>Order:</strong> #${escapeHtml(input.orderLabel)}</p>
              <p style="margin:0;"><strong>Product:</strong> ${escapeHtml(input.productTitle)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;">
              <table role="presentation" width="100%" style="background:#0b1220;border:1px solid #1e293b;border-radius:12px;">
                <tr>
                  <td style="padding:16px;font-size:14px;line-height:1.7;color:#e2e8f0;">
                    <p style="margin:0 0 10px;"><strong>Login</strong><br />${escapeHtml(login)}</p>
                    <p style="margin:0 0 10px;"><strong>Password</strong><br />${escapeHtml(password)}</p>
                    <p style="margin:0 0 10px;"><strong>Account email</strong><br />${escapeHtml(accountEmail)}</p>
                    ${
                      extra
                        ? `<p style="margin:0;"><strong>Extra</strong><br />${escapeHtml(extra)}</p>`
                        : ""
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;font-size:13px;color:#94a3b8;line-height:1.6;">
              <p style="margin:0 0 10px;"><strong style="color:#cbd5e1;">Security</strong></p>
              <ul style="margin:0;padding-left:18px;">
                <li>Change the password after first login when possible.</li>
                <li>Do not share these credentials with anyone.</li>
                <li>We will never ask for your payment card details by email.</li>
              </ul>
              <p style="margin:16px 0 0;">
                Need help? WhatsApp
                <a href="${escapeHtml(WHATSAPP_URL)}" style="color:#60a5fa;text-decoration:none;">${escapeHtml(WHATSAPP_DISPLAY)}</a>
              </p>
              <p style="margin:8px 0 0;">
                <a href="${escapeHtml(site)}" style="color:#64748b;text-decoration:none;">${escapeHtml(site)}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text: textLines.join("\n") };
}

function blocked(
  orderId: string,
  errorCode: string
): InventoryEmailDeliveryResult {
  return {
    ok: false,
    status: "blocked",
    order_id: orderId,
    error_code: errorCode,
  };
}

async function markAttemptFailed(
  attemptId: string,
  errorCode: string
): Promise<void> {
  const service = getSupabaseService();
  await service
    .from("delivery_attempts")
    .update({
      status: "failed",
      error_code: errorCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attemptId)
    .neq("status", "sent");
}

async function finalizeSuccessfulDelivery(input: {
  orderId: string;
  inventoryItemId: string;
  attemptId: string;
  providerMessageId: string | null;
}): Promise<void> {
  const service = getSupabaseService();
  const now = new Date().toISOString();

  const { error: attemptError } = await service
    .from("delivery_attempts")
    .update({
      status: "sent",
      provider_message_id: input.providerMessageId,
      error_code: null,
      updated_at: now,
    })
    .eq("id", input.attemptId);

  if (attemptError) {
    logServerError("inventory email attempt sent", attemptError);
  }

  const { error: inventoryError } = await service
    .from("inventory_items")
    .update({
      status: "delivered",
      delivered_at: now,
      updated_at: now,
    })
    .eq("id", input.inventoryItemId)
    .in("status", ["assigned", "delivered"]);

  if (inventoryError) {
    logServerError("inventory email mark delivered", inventoryError);
  }

  const { error: orderError } = await service
    .from("orders")
    .update({
      status: "fulfilled",
      order_status: "fulfilled",
      fulfilled_at: now,
      updated_at: now,
      delivery_method: "email",
    })
    .eq("id", input.orderId)
    .neq("status", "cancelled")
    .neq("status", "refunded");

  if (orderError) {
    // Fallback without optional columns if schema lag.
    if (/fulfilled_at|delivery_method|column/i.test(orderError.message)) {
      await service
        .from("orders")
        .update({
          status: "fulfilled",
          order_status: "fulfilled",
          updated_at: now,
        })
        .eq("id", input.orderId);
    } else {
      logServerError("inventory email mark fulfilled", orderError);
    }
  }
}

type DeliveryDeps = {
  sendEmail?: (input: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }) => Promise<SendEmailResult>;
};

/**
 * Deliver assigned inventory credentials by email.
 * Decrypts only in-process. Never returns credentials.
 */
export async function deliverInventoryByEmail(
  orderId: string,
  deps: DeliveryDeps = {}
): Promise<InventoryEmailDeliveryResult> {
  const service = getSupabaseService();
  const idempotencyKey = emailDeliveryIdempotencyKey(orderId);

  const { data: order, error: orderError } = await service
    .from("orders")
    .select(
      "id,order_number,customer_email,status,order_status,payment_status,fulfilled_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    logServerError("inventory email order load", orderError);
    return blocked(orderId, "ORDER_LOOKUP_FAILED");
  }

  if (!order) {
    return blocked(orderId, "ORDER_NOT_FOUND");
  }

  const status = (order.status || order.order_status || "").toLowerCase();
  if (status === "cancelled" || status === "refunded") {
    return blocked(orderId, "ORDER_NOT_ELIGIBLE");
  }
  if (order.payment_status === "failed" || order.payment_status === "refunded") {
    return blocked(orderId, "ORDER_NOT_ELIGIBLE");
  }
  if (order.payment_status !== "paid") {
    return blocked(orderId, "ORDER_NOT_PAID");
  }

  const customerEmail = (order.customer_email || "").trim();
  if (!customerEmail) {
    return blocked(orderId, "MISSING_CUSTOMER_EMAIL");
  }

  const { data: inventory, error: inventoryError } = await service
    .from("inventory_items")
    .select("id,status,product_id,order_id,order_item_id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  if (inventoryError) {
    if (/relation|schema cache|does not exist|PGRST/i.test(inventoryError.message)) {
      return blocked(orderId, "INVENTORY_UNAVAILABLE");
    }
    logServerError("inventory email inventory load", inventoryError);
    return blocked(orderId, "INVENTORY_LOOKUP_FAILED");
  }

  if (!inventory) {
    return blocked(orderId, "NO_ASSIGNED_INVENTORY");
  }

  const earlyGate = evaluateEmailDeliveryEligibility({
    order,
    inventory,
    hasCredentials: true, // credentials checked after decrypt path setup
  });
  if (!earlyGate.ok && earlyGate.error_code !== "MISSING_CREDENTIALS") {
    return blocked(orderId, earlyGate.error_code);
  }

  // Already fully delivered + emailed?
  const { data: existingAttempt } = await service
    .from("delivery_attempts")
    .select("id,status,provider_message_id,inventory_item_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (
    existingAttempt?.status === "sent" ||
    (inventory.status === "delivered" && existingAttempt?.status === "sent")
  ) {
    return {
      ok: true,
      status: "already_sent",
      order_id: orderId,
      inventory_item_id: inventory.id,
      provider_message_id: existingAttempt.provider_message_id,
      idempotent: true,
    };
  }

  if (existingAttempt?.status === "pending") {
    return {
      ok: true,
      status: "in_progress",
      order_id: orderId,
      inventory_item_id: inventory.id,
      idempotent: true,
    };
  }

  const { data: credentials, error: credError } = await service
    .from("inventory_credentials")
    .select("ciphertext,nonce,key_version")
    .eq("inventory_item_id", inventory.id)
    .maybeSingle();

  if (credError) {
    logServerError("inventory email credentials load", {
      code: credError.code,
      message: "credential lookup failed",
    });
    return blocked(orderId, "CREDENTIALS_LOOKUP_FAILED");
  }

  if (!credentials?.ciphertext || !credentials?.nonce) {
    return blocked(orderId, "MISSING_CREDENTIALS");
  }

  let decrypted: InventoryCredentialPayload;
  try {
    decrypted = decryptInventoryCredentials(
      credentials.ciphertext,
      credentials.nonce,
      Number(credentials.key_version) || 1
    );
  } catch (error) {
    logServerError("inventory email decrypt", {
      code: "DECRYPT_FAILED",
      message: error instanceof Error ? error.message : "decrypt failed",
    });
    return blocked(orderId, "DECRYPT_FAILED");
  }

  // Resolve product title from order_item (never from credentials).
  let productTitle = "Game Account";
  if (inventory.order_item_id) {
    const { data: item } = await service
      .from("order_items")
      .select("product_title,title_snapshot")
      .eq("id", inventory.order_item_id)
      .maybeSingle();
    productTitle =
      (item?.title_snapshot || item?.product_title || productTitle).trim() ||
      productTitle;
  } else if (inventory.product_id) {
    const { data: product } = await service
      .from("products")
      .select("title")
      .eq("id", inventory.product_id)
      .maybeSingle();
    productTitle = (product?.title || productTitle).trim() || productTitle;
  }

  let attemptId = existingAttempt?.id ?? null;

  if (existingAttempt?.status === "failed" && attemptId) {
    const { data: claimed, error: claimError } = await service
      .from("delivery_attempts")
      .update({
        status: "pending",
        error_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attemptId)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();

    if (claimError || !claimed) {
      // Another worker claimed the retry, or row changed.
      const { data: again } = await service
        .from("delivery_attempts")
        .select("id,status,provider_message_id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (again?.status === "sent") {
        return {
          ok: true,
          status: "already_sent",
          order_id: orderId,
          inventory_item_id: inventory.id,
          provider_message_id: again.provider_message_id,
          idempotent: true,
        };
      }
      if (again?.status === "pending") {
        return {
          ok: true,
          status: "in_progress",
          order_id: orderId,
          inventory_item_id: inventory.id,
          idempotent: true,
        };
      }
      return {
        ok: false,
        status: "failed",
        order_id: orderId,
        inventory_item_id: inventory.id,
        error_code: "DELIVERY_CLAIM_FAILED",
      };
    }
  } else if (!attemptId) {
    const { data: created, error: insertError } = await service
      .from("delivery_attempts")
      .insert({
        order_id: orderId,
        inventory_item_id: inventory.id,
        channel: EMAIL_DELIVERY_CHANNEL,
        status: "pending",
        idempotency_key: idempotencyKey,
      })
      .select("id,status")
      .maybeSingle();

    if (insertError) {
      if (
        insertError.code === "23505" ||
        /duplicate key|unique constraint/i.test(insertError.message)
      ) {
        const { data: raced } = await service
          .from("delivery_attempts")
          .select("id,status,provider_message_id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (raced?.status === "sent") {
          return {
            ok: true,
            status: "already_sent",
            order_id: orderId,
            inventory_item_id: inventory.id,
            provider_message_id: raced.provider_message_id,
            idempotent: true,
          };
        }
        if (raced?.status === "pending") {
          return {
            ok: true,
            status: "in_progress",
            order_id: orderId,
            inventory_item_id: inventory.id,
            idempotent: true,
          };
        }
        if (raced?.status === "failed" && raced.id) {
          attemptId = raced.id;
          const { data: reclaimed } = await service
            .from("delivery_attempts")
            .update({
              status: "pending",
              error_code: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", raced.id)
            .eq("status", "failed")
            .select("id")
            .maybeSingle();
          if (!reclaimed) {
            return {
              ok: true,
              status: "in_progress",
              order_id: orderId,
              inventory_item_id: inventory.id,
              idempotent: true,
            };
          }
        } else {
          return {
            ok: false,
            status: "failed",
            order_id: orderId,
            inventory_item_id: inventory.id,
            error_code: "DELIVERY_ATTEMPT_CONFLICT",
          };
        }
      } else if (/relation|schema cache|does not exist|PGRST/i.test(insertError.message)) {
        return blocked(orderId, "DELIVERY_TABLE_UNAVAILABLE");
      } else {
        logServerError("inventory email attempt insert", insertError);
        return {
          ok: false,
          status: "failed",
          order_id: orderId,
          inventory_item_id: inventory.id,
          error_code: "DELIVERY_ATTEMPT_CREATE_FAILED",
        };
      }
    } else if (created?.id) {
      attemptId = created.id;
    }
  }

  if (!attemptId) {
    return {
      ok: false,
      status: "failed",
      order_id: orderId,
      inventory_item_id: inventory.id,
      error_code: "DELIVERY_ATTEMPT_MISSING",
    };
  }

  const emailContent = buildInventoryDeliveryEmail({
    orderLabel: shortOrderLabel(order),
    productTitle,
    credentials: decrypted,
  });

  // Clear plaintext reference intent: do not log decrypted.
  const send = deps.sendEmail || sendTransactionalEmail;
  const sendResult = await send({
    to: customerEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  });

  if (!sendResult.ok) {
    await markAttemptFailed(attemptId, sendResult.error_code);
    console.info("[inventory.email]", {
      order_id: orderId,
      inventory_item_id: inventory.id,
      delivery_attempt_id: attemptId,
      channel: EMAIL_DELIVERY_CHANNEL,
      status: "failed",
      error_code: sendResult.error_code,
    });
    return {
      ok: false,
      status: "failed",
      order_id: orderId,
      inventory_item_id: inventory.id,
      error_code: sendResult.error_code,
    };
  }

  await finalizeSuccessfulDelivery({
    orderId,
    inventoryItemId: inventory.id,
    attemptId,
    providerMessageId: sendResult.provider_message_id,
  });

  console.info("[inventory.email]", {
    order_id: orderId,
    inventory_item_id: inventory.id,
    delivery_attempt_id: attemptId,
    channel: EMAIL_DELIVERY_CHANNEL,
    status: "sent",
    provider_message_id: sendResult.provider_message_id,
  });

  return {
    ok: true,
    status: "sent",
    order_id: orderId,
    inventory_item_id: inventory.id,
    provider_message_id: sendResult.provider_message_id,
  };
}
