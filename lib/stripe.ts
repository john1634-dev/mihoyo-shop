import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  if (key.startsWith("pk_")) {
    throw new Error("STRIPE_SECRET_KEY must be a secret key (sk_...), not a publishable key");
  }

  stripeClient = new Stripe(key);

  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }
  return secret;
}

/** Convert major units (e.g. 1099.00 MYR) to Stripe smallest currency unit. */
export function toStripeUnitAmount(amount: number, currency: string): number {
  const code = currency.trim().toUpperCase();
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  // MYR and USD use 2 decimal places in Stripe.
  const zeroDecimal = new Set([
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ]);

  if (zeroDecimal.has(code)) {
    return Math.round(value);
  }

  return Math.round(value * 100);
}

export function fromStripeUnitAmount(unitAmount: number, currency: string): number {
  const code = currency.trim().toUpperCase();
  const zeroDecimal = new Set([
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ]);

  if (zeroDecimal.has(code)) {
    return unitAmount;
  }

  return unitAmount / 100;
}
