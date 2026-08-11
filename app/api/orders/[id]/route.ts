import { NextResponse } from "next/server";
import { getRequestUser, supabase } from "@/lib/supabase";
import { toUserError } from "@/lib/errors";
import type { OrderReceipt } from "@/lib/orders";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const { user, client } = await getRequestUser(request);
    const rpcClient = user ? client : supabase;

    const { data, error } = await rpcClient.rpc("get_order_receipt", {
      p_order_id: id,
    });

    if (error) {
      return NextResponse.json(
        { error: toUserError(error.message) },
        { status: 404 }
      );
    }

    return NextResponse.json(data as OrderReceipt);
  } catch (error) {
    return NextResponse.json({ error: toUserError(error) }, { status: 500 });
  }
}
