import "server-only";

import { Resend } from "resend";
import { logServerError } from "@/lib/errors";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult =
  | { ok: true; provider_message_id: string | null }
  | { ok: false; error_code: string };

type EmailTransport = (input: SendEmailInput) => Promise<SendEmailResult>;

let transportOverride: EmailTransport | null = null;

/** Test-only: inject a mock transport. Never use with real credentials. */
export function setEmailTransportForTests(transport: EmailTransport | null): void {
  transportOverride = transport;
}

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
  return new Resend(apiKey);
}

function getFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    throw new Error("Missing RESEND_FROM_EMAIL");
  }
  return from;
}

/**
 * Send a transactional email via Resend.
 * Never logs HTML/text bodies (may contain credentials).
 */
export async function sendTransactionalEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  if (transportOverride) {
    return transportOverride(input);
  }

  let from: string;
  try {
    from = getFromAddress();
  } catch {
    return { ok: false, error_code: "EMAIL_CONFIG_MISSING" };
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    return { ok: false, error_code: "EMAIL_CONFIG_MISSING" };
  }

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (error) {
      logServerError("resend.send", {
        code: (error as { name?: string }).name || "RESEND_ERROR",
        message: error.message,
      });
      return { ok: false, error_code: "EMAIL_SEND_FAILED" };
    }

    return {
      ok: true,
      provider_message_id: data?.id ?? null,
    };
  } catch (error) {
    logServerError("resend.send.exception", error);
    return { ok: false, error_code: "EMAIL_SEND_FAILED" };
  }
}
