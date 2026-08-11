import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase";
import { logServerError, toUserError } from "@/lib/errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, client } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await client
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { is_hidden?: boolean };
  const { error } = await client
    .from("reviews")
    .update({ is_hidden: Boolean(body.is_hidden) })
    .eq("id", id);

  if (error) {
    logServerError("reviews PATCH", error);
    return NextResponse.json({ error: toUserError(error.message) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, client } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await client
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await client.from("reviews").delete().eq("id", id);
  if (error) {
    logServerError("reviews DELETE", error);
    return NextResponse.json({ error: toUserError(error.message) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
