import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase";
import { getSupabaseService } from "@/lib/supabase-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string; subtotal?: number };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const subtotal = typeof body.subtotal === "number" ? body.subtotal : 0;

    if (!code) {
      return NextResponse.json({ error: "Coupon code is required." }, { status: 400 });
    }

    // Identify user (optional — needed for per-user usage limit).
    const { user } = await getRequestUser(request);
    const userId = user?.id ?? null;

    // Use service role so the RPC can read coupons (RLS blocks anon reads).
    const supabase = getSupabaseService();
    const { data, error } = await supabase.rpc("validate_coupon", {
      p_code: code,
      p_order_subtotal: subtotal,
      p_user_id: userId,
    });

    if (error) {
      return NextResponse.json({ error: "Could not validate coupon." }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
