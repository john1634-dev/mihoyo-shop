import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase";
import { logServerError, toUserError } from "@/lib/errors";

export async function GET(request: Request) {
  const { user, client } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await client
    .from("wishlists")
    .select("product_id, created_at, products(id, title, slug, price, currency, status, cover_image_url, game_id)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    logServerError("wishlist GET", error);
    return NextResponse.json({ error: toUserError(error.message) }, { status: 400 });
  }
  return NextResponse.json({ wishlist: data ?? [] });
}

export async function POST(request: Request) {
  const { user, client } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { product_id?: string };
  if (!body.product_id) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const { error } = await client
    .from("wishlists")
    .insert({ user_id: user.id, product_id: body.product_id });

  if (error && error.code !== "23505") {
    logServerError("wishlist POST", error);
    return NextResponse.json({ error: toUserError(error.message) }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { user, client } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { product_id?: string };
  if (!body.product_id) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const { error } = await client
    .from("wishlists")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", body.product_id);
  if (error) {
    logServerError("wishlist DELETE", error);
    return NextResponse.json({ error: toUserError(error.message) }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
