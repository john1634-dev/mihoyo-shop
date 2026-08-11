import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase";
import { getSupabaseService } from "@/lib/supabase-service";
import { logServerError, toUserError } from "@/lib/errors";

export async function GET(request: Request) {
  const { user, client } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await client
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? "30d";

  const svc = getSupabaseService();

  let fromDate: string | null = null;
  const now = new Date();
  if (range === "today") {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    fromDate = d.toISOString();
  } else if (range === "7d") {
    fromDate = new Date(now.getTime() - 7 * 86400000).toISOString();
  } else if (range === "30d") {
    fromDate = new Date(now.getTime() - 30 * 86400000).toISOString();
  }
  // "all" = no filter

  let query = svc.from("v_sales_summary").select("*");
  if (fromDate) query = query.gte("day", fromDate);

  const { data: salesData, error: salesError } = await query.order("day", { ascending: true });
  if (salesError) {
    logServerError("admin analytics", salesError);
    return NextResponse.json({ error: toUserError(salesError.message) }, { status: 400 });
  }

  // Top selling games
  const { data: topGames } = await svc
    .from("order_items")
    .select("product_id, product_title, products(game_id, games(name))")
    .limit(200);

  // Aggregate top games from order_items manually (view would be cleaner but this avoids extra migration)
  const gameMap: Record<string, { name: string; count: number }> = {};
  for (const item of topGames ?? []) {
    const p = (item as { products?: { games?: { name?: string } | null } | null }).products;
    const gameName = p?.games?.name ?? "Unknown";
    if (!gameMap[gameName]) gameMap[gameName] = { name: gameName, count: 0 };
    gameMap[gameName].count++;
  }
  const topGamesList = Object.values(gameMap).sort((a, b) => b.count - a.count).slice(0, 5);

  return NextResponse.json({
    range,
    sales: salesData ?? [],
    topGames: topGamesList,
  });
}
