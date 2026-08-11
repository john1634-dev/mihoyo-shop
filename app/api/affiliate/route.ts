import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase";
import { logServerError, toUserError } from "@/lib/errors";

export async function GET(request: Request) {
  const { user, client } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await client.rpc("get_or_create_affiliate");
  if (error) {
    logServerError("affiliate GET", error);
    return NextResponse.json({ error: toUserError(error.message) }, { status: 400 });
  }
  const aff = data as { id: string; referral_code: string; is_active: boolean };
  const { count } = await client
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("affiliate_id", aff.id);

  return NextResponse.json({ ...aff, referred_count: count ?? 0 });
}

export async function POST(request: Request) {
  const { user, client } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { referral_code?: string };
  if (!body.referral_code) return NextResponse.json({ error: "referral_code required" }, { status: 400 });
  if (body.referral_code.length > 32) {
    return NextResponse.json({ error: "Invalid referral code." }, { status: 400 });
  }

  const { data, error } = await client.rpc("record_referral", {
    p_referral_code: body.referral_code,
  });
  if (error) {
    logServerError("affiliate POST", error);
    return NextResponse.json({ error: toUserError(error.message) }, { status: 400 });
  }
  return NextResponse.json(data);
}
