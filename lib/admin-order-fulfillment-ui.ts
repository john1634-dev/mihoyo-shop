import type { OrderStatus } from "@/lib/orders";

export type AdminOrderInventoryMeta = {
  exists: boolean;
  id: string | null;
  status: string | null;
  assigned_at: string | null;
  delivered_at: string | null;
};

export type AdminOrderEmailDeliveryMeta = {
  status: string | null;
  provider_message_id: string | null;
  error_code: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminOrderDetailView = {
  id: string;
  order_number: string | null;
  status: OrderStatus;
  order_status: string | null;
  payment_status: string | null;
  customer_email: string | null;
  customer_name: string | null;
  currency: string;
  amount: number;
  channel: string | null;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
};

/** Paid order with no inventory and no successful email yet. */
export function orderNeedsManualAccount(input: {
  payment_status?: string | null;
  status?: OrderStatus | string | null;
  inventory?: { exists: boolean } | null;
  email_delivery?: { status?: string | null } | null;
}): boolean {
  if (input.payment_status !== "paid") return false;
  const status = String(input.status || "").toLowerCase();
  if (status === "cancelled" || status === "refunded") return false;
  if (input.inventory?.exists) return false;
  if (input.email_delivery?.status === "sent") return false;
  return true;
}

export function showManualFulfillForm(input: {
  payment_status?: string | null;
  status?: OrderStatus | string | null;
  inventory?: { exists: boolean; status?: string | null } | null;
  email_delivery?: { status?: string | null } | null;
}): boolean {
  if (input.payment_status !== "paid") return false;
  const status = String(input.status || "").toLowerCase();
  if (status === "cancelled" || status === "refunded") return false;
  if (input.inventory?.exists) return false;
  if (input.email_delivery?.status === "sent") return false;
  if (String(input.status || "").toLowerCase() === "fulfilled") return false;
  return true;
}

export function showRetryEmailAction(input: {
  inventory?: { exists: boolean; status?: string | null } | null;
  email_delivery?: { status?: string | null } | null;
  status?: OrderStatus | string | null;
}): boolean {
  if (input.email_delivery?.status === "sent") return false;
  if (String(input.status || "").toLowerCase() === "fulfilled") return false;
  return (
    input.inventory?.exists === true &&
    input.inventory.status === "assigned" &&
    input.email_delivery?.status === "failed"
  );
}

export function showEmailSentState(input: {
  email_delivery?: { status?: string | null } | null;
  status?: OrderStatus | string | null;
}): boolean {
  return (
    input.email_delivery?.status === "sent" ||
    String(input.status || "").toLowerCase() === "fulfilled"
  );
}

export function mapManualFulfillError(
  errorCode: string | undefined,
  status?: string
): string {
  if (status === "already_sent") {
    return "This account has already been sent.";
  }

  switch (errorCode) {
    case "INVENTORY_ALREADY_ASSIGNED":
      return "Inventory is already assigned to this order. Use Retry Email instead.";
    case "ALREADY_DELIVERED":
      return "This account has already been sent.";
    case "CREDENTIAL_STORE_FAILED":
      return "Failed to securely store the account details. No email was sent.";
    case "MISSING_CUSTOMER_EMAIL":
      return "Customer email is missing.";
    case "ORDER_NOT_PAID":
    case "ORDER_NOT_ELIGIBLE":
      return "Order is not eligible for fulfillment.";
    case "EMAIL_SEND_FAILED":
    case "EMAIL_CONFIG_MISSING":
      return "Account was stored, but email delivery failed. Use Retry Email.";
    case "VALIDATION_ERROR":
      return "Please check the form and try again.";
    default:
      return "Manual fulfillment failed. Please try again.";
  }
}

export const EMPTY_MANUAL_FULFILL_FORM = {
  login: "",
  password: "",
  email: "",
  extra: "",
};
