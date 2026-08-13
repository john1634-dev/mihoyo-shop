import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

function receiptSecret(): string {
  const explicit = process.env.ORDER_RECEIPT_SECRET?.trim();
  if (explicit) return explicit;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing ORDER_RECEIPT_SECRET — required in production (must be separate from STRIPE_WEBHOOK_SECRET)"
    );
  }

  // Local/dev fallback only — do not reuse STRIPE_WEBHOOK_SECRET in production.
  const stripe = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (stripe) return `receipt:${stripe}`;

  throw new Error("Missing ORDER_RECEIPT_SECRET");
}

export function hashReceiptToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createReceiptToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Signed capability token for guest success/receipt pages (not guessable UUID alone). */
export function signOrderAccessToken(input: {
  orderId: string;
  email: string;
  expiresAt: number;
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      oid: input.orderId,
      em: input.email.toLowerCase().trim(),
      exp: input.expiresAt,
    }),
    "utf8"
  ).toString("base64url");

  const sig = createHmac("sha256", receiptSecret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${sig}`;
}

export function verifyOrderAccessToken(
  token: string | null | undefined,
  expectedOrderId: string
): { ok: true; email: string } | { ok: false } {
  if (!token || !token.includes(".")) return { ok: false };

  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return { ok: false };

    const expected = createHmac("sha256", receiptSecret())
      .update(payload)
      .digest("base64url");

    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false };
    }

    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { oid?: string; em?: string; exp?: number };

    if (!data.oid || !data.em || !data.exp) return { ok: false };
    if (data.oid !== expectedOrderId) return { ok: false };
    if (Date.now() > data.exp) return { ok: false };

    return { ok: true, email: data.em };
  } catch {
    return { ok: false };
  }
}

export const RECEIPT_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
