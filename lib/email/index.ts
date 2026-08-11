import {
  buildOrderCompletedEmail,
  buildOrderCreatedEmail,
  buildPaymentConfirmedEmail,
  buildPaymentFailedEmail,
} from "@/lib/email/templates";
import { isEmailConfigured, sendEmail, type EmailResult } from "@/lib/email/send";

export type OrderMailPayload = {
  customerName: string;
  customerEmail: string;
  orderNumber: string;
  orderId: string;
  status: string;
  paymentStatus: string;
  total: number;
  currency?: string;
  items: Array<{ title: string; price: number; quantity?: number }>;
  createdAt?: string | null;
};

export async function notifyOrderCreated(
  payload: OrderMailPayload
): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    return { ok: false, reason: "Email provider not configured." };
  }
  return sendEmail(buildOrderCreatedEmail(payload));
}

export async function notifyPaymentConfirmed(
  payload: OrderMailPayload
): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    return { ok: false, reason: "Email provider not configured." };
  }
  return sendEmail(buildPaymentConfirmedEmail(payload));
}

export async function notifyOrderCompleted(
  payload: OrderMailPayload
): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    return { ok: false, reason: "Email provider not configured." };
  }
  return sendEmail(buildOrderCompletedEmail(payload));
}

export async function notifyPaymentFailed(
  payload: OrderMailPayload
): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    return { ok: false, reason: "Email provider not configured." };
  }
  return sendEmail(buildPaymentFailedEmail(payload));
}
