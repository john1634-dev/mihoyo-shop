export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailResult = {
  ok: boolean;
  reason?: string;
  id?: string;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    const reason = "Email provider not configured.";
    if (process.env.NODE_ENV !== "production") {
      console.info("[email]", reason, {
        to: message.to,
        subject: message.subject,
      });
    }
    return { ok: false, reason };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    const payload = (await response.json()) as { id?: string; message?: string };

    if (!response.ok) {
      return {
        ok: false,
        reason: "Email provider rejected the request.",
      };
    }

    return { ok: true, id: payload.id };
  } catch {
    return {
      ok: false,
      reason: "Email provider request failed.",
    };
  }
}
