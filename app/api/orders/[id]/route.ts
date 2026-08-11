import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase";
import { getSupabaseService } from "@/lib/supabase-service";
import { logServerError, toUserError } from "@/lib/errors";
import { isValidEmail } from "@/lib/validation";
import type { OrderReceipt } from "@/lib/orders";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/orders/[id]
 * - Logged-in owners / admins: via get_order_receipt RPC
 * - Guests: must supply matching ?email= (capability + email gate)
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const url = new URL(request.url);
    const emailParam = (url.searchParams.get("email") || "").trim().toLowerCase();

    const { user, client } = await getRequestUser(request);

    if (user) {
      const { data, error } = await client.rpc("get_order_receipt", {
        p_order_id: id,
      });

      if (error) {
        logServerError("orders GET owned", error);
        return NextResponse.json(
          { error: toUserError(error.message) },
          { status: 404 }
        );
      }

      return NextResponse.json(data as OrderReceipt);
    }

    // Guest access: require email that matches the order.
    if (!emailParam || !isValidEmail(emailParam)) {
      return NextResponse.json(
        { error: "Email is required to view this guest order." },
        { status: 401 }
      );
    }

    const svc = getSupabaseService();
    const { data: orderRow, error: orderError } = await svc
      .from("orders")
      .select("id, customer_id, customer_email")
      .eq("id", id)
      .maybeSingle();

    if (orderError) {
      logServerError("orders GET guest lookup", orderError);
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (!orderRow) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    // Registered orders must not be readable with email alone.
    if (orderRow.customer_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orderEmail = String(orderRow.customer_email || "")
      .trim()
      .toLowerCase();

    if (!orderEmail || orderEmail !== emailParam) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const { data, error } = await svc.rpc("get_order_receipt", {
      p_order_id: id,
    });

    if (error) {
      logServerError("orders GET guest receipt", error);
      return NextResponse.json(
        { error: toUserError(error.message) },
        { status: 404 }
      );
    }

    return NextResponse.json(data as OrderReceipt);
  } catch (error) {
    logServerError("orders GET", error);
    return NextResponse.json({ error: toUserError(error) }, { status: 500 });
  }
}
