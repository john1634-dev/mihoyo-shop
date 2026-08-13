type ErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function redactSecrets(value: string): string {
  return value
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "[REDACTED_SECRET]")
    .replace(/whsec_[A-Za-z0-9]+/g, "[REDACTED_SECRET]")
    .replace(/[A-Za-z0-9_-]{32,}/g, (match) => {
      // Redact long base64url blobs (ciphertext/nonce) without logging credential material.
      if (match.length >= 48) return "[REDACTED_BLOB]";
      return match;
    })
    .replace(/INVENTORY_ENCRYPTION_KEY[=:\s][^\s]+/gi, "INVENTORY_ENCRYPTION_KEY=[REDACTED]")
    .replace(/TRANSLATION_API_KEY[=:\s][^\s]+/gi, "TRANSLATION_API_KEY=[REDACTED]")
    .replace(/RESEND_API_KEY[=:\s][^\s]+/gi, "RESEND_API_KEY=[REDACTED]")
    .replace(/re_[A-Za-z0-9]{20,}/g, "[REDACTED_RESEND_KEY]");
}

export function logServerError(context: string, error: unknown): void {
  if (error && typeof error === "object") {
    const e = error as ErrorLike;
    console.error(`[${context}]`, {
      code: e.code,
      message: e.message ? redactSecrets(e.message) : undefined,
      details: e.details ? redactSecrets(String(e.details)) : undefined,
      hint: e.hint,
    });
    return;
  }

  console.error(`[${context}]`, redactSecrets(String(error)));
}

export function toUserError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Something went wrong. Please try again.";

  const message = raw.toUpperCase();

  if (message.includes("PRODUCT_NOT_FOUND")) {
    return "This listing could not be found. Please refresh and try again.";
  }

  if (message.includes("INVALID_EMAIL")) {
    return "Please enter a valid email address.";
  }

  if (message.includes("SHOPEE")) {
    return "Shopee is not available right now. Please contact us on WhatsApp.";
  }

  if (message.includes("WHATSAPP") && message.includes("CONFIG")) {
    return "WhatsApp is not configured yet. Please try again later.";
  }

  if (
    message.includes("JWT") ||
    message.includes("RLS") ||
    message.includes("PERMISSION") ||
    message.includes("POLICY") ||
    message.includes("VIOLATES") ||
    message.includes("SUPABASE") ||
    message.includes("API KEY") ||
    message.includes("COLUMN") ||
    message.includes("RELATION")
  ) {
    return "Something went wrong. Please try again.";
  }

  return "Something went wrong. Please try again.";
}
