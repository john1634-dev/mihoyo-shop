import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase-service";
import { logServerError, toUserError } from "@/lib/errors";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (isNextResponse(auth)) return auth;

  const svc = getSupabaseService();

  const [
    { count: totalProducts, error: totalError },
    { count: availableProducts, error: availableError },
    { count: soldProducts, error: soldError },
    { count: totalGames, error: gamesError },
  ] = await Promise.all([
    svc.from("products").select("id", { count: "exact", head: true }),
    svc
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "available"),
    svc
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "sold"),
    svc.from("games").select("id", { count: "exact", head: true }),
  ]);

  const error =
    totalError || availableError || soldError || gamesError || null;

  if (error) {
    logServerError("admin stats", error);
    return NextResponse.json(
      { error: toUserError(error.message) },
      { status: 400 }
    );
  }

  return NextResponse.json({
    total_products: totalProducts ?? 0,
    available_products: availableProducts ?? 0,
    sold_products: soldProducts ?? 0,
    total_games: totalGames ?? 0,
  });
}
