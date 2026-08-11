import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase-service";
import { logServerError, toUserError } from "@/lib/errors";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (isNextResponse(auth)) return auth;

  const svc = getSupabaseService();
  const { data, error } = await svc.from("v_admin_dashboard").select("*").single();
  if (error) {
    logServerError("admin stats", error);
    return NextResponse.json({ error: toUserError(error.message) }, { status: 400 });
  }
  return NextResponse.json(data);
}
