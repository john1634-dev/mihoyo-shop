import { NextResponse } from "next/server";
import { logServerError } from "@/lib/errors";
import { authorizeZinkGameCronRequest } from "@/lib/supplier/cron-auth";
import { runScheduledZinkGameSync } from "@/lib/supplier/scheduled-sync";
import { getSupabaseService } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function scheduledOutcomeResponse(
  outcome: Awaited<ReturnType<typeof runScheduledZinkGameSync>>
) {
  if (outcome.kind === "already_running") {
    return NextResponse.json(
      { ok: false, status: "already_running" },
      { status: 409 }
    );
  }

  if (outcome.kind === "source_unavailable") {
    return NextResponse.json(
      {
        ok: false,
        status: "source_unavailable",
        runId: outcome.runId,
        sourceUnavailable: true,
      },
      { status: 502 }
    );
  }

  if (outcome.kind === "failed") {
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        runId: outcome.runId,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    supplier: outcome.supplier,
    status: outcome.status,
    runId: outcome.runId,
    checked: outcome.checked,
    priceUpdated: outcome.priceUpdated,
    statusUpdated: outcome.statusUpdated,
    requiresReview: outcome.requiresReview,
    errors: outcome.errors,
    unchanged: outcome.unchanged,
    skipped: outcome.skipped,
    newProducts: outcome.newProducts,
    durationMs: outcome.durationMs,
  });
}

async function handleCron(request: Request) {
  const auth = authorizeZinkGameCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const client = getSupabaseService();
    const outcome = await runScheduledZinkGameSync(client, {
      triggerType: "cron",
    });
    return scheduledOutcomeResponse(outcome);
  } catch (error) {
    logServerError("cron zinkgame sync", error);
    return NextResponse.json(
      { ok: false, status: "failed" },
      { status: 500 }
    );
  }
}

/**
 * GET/POST /api/cron/zinkgame-sync
 * Vercel Cron uses GET. Manual/ops may POST. Bearer secret required.
 */
export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
