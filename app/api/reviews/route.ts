import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase";
import { logServerError, toUserError } from "@/lib/errors";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const { client } = await getRequestUser(request);
  const { data, error } = await client
    .from("reviews")
    .select("id, rating, body, created_at, updated_at, profiles(full_name, email)")
    .eq("product_id", productId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false });

  if (error) {
    logServerError("reviews GET", error);
    return NextResponse.json({ error: toUserError(error.message) }, { status: 400 });
  }
  return NextResponse.json({ reviews: data ?? [] });
}

export async function POST(request: Request) {
  const { user, client } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    product_id?: string;
    order_id?: string;
    rating?: number;
    body?: string;
  };

  if (!body.product_id || !body.order_id) {
    return NextResponse.json({ error: "product_id and order_id are required." }, { status: 400 });
  }
  if (!body.rating || body.rating < 1 || body.rating > 5) {
    return NextResponse.json({ error: "Rating must be between 1 and 5." }, { status: 400 });
  }
  if (typeof body.body === "string" && body.body.length > 1500) {
    return NextResponse.json({ error: "Review is too long." }, { status: 400 });
  }

  const { data, error } = await client.rpc("submit_review", {
    p_product_id: body.product_id,
    p_order_id: body.order_id,
    p_rating: body.rating,
    p_body: body.body ?? null,
  });

  if (error) {
    logServerError("reviews POST", error);
    const msg = error.message.includes("PURCHASE_REQUIRED")
      ? "You can only review products you have purchased."
      : error.message.includes("UNAUTHORIZED")
      ? "You must be logged in to submit a review."
      : toUserError(error.message);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...(data as object) });
}
