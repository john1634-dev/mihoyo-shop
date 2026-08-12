import { NextResponse } from "next/server";
import { getVndToMyrRate } from "@/lib/exchange-rate";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  try {
    const rate = await getVndToMyrRate(force);
    return NextResponse.json({
      success: true,
      from: rate.from,
      to: rate.to,
      rate: rate.rate,
      updatedAt: rate.updatedAt,
      source: rate.source,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to fetch exchange rate right now.",
      },
      { status: 503 }
    );
  }
}
