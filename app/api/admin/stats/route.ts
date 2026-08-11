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

  const svc = getSupabaseService();
  const { data, error } = await svc.from("v_admin_dashboard").select("*").single();
  if (error) {
    logServerError("admin stats", error);
    return NextResponse.json({ error: toUserError(error.message) }, { status: 400 });
  }
  return NextResponse.json(data);
}
