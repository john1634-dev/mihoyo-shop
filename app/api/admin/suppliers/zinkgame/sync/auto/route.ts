import { NextResponse } from "next/server";
import { logServerError, toUserError } from "@/lib/errors";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { runSafeAutoSync } from "@/lib/supplier/auto-sync";
import { runScheduledZinkGameSync } from "@/lib/supplier/scheduled-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AutoSyncBody = {
  confirm?: boolean;
  /** Ignored — server re-fetches supplier data. */
  price?: number;
  status?: string;
  title?: string;
};

/**
 * POST /api/admin/suppliers/zinkgame/sync/auto
 * Dry run (confirm: false) or apply safe automatic price/status sync (confirm: true).
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  let body: AutoSyncBody;
  try {
    body = (await request.json()) as AutoSyncBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.confirm !== true && body.confirm !== false) {
    return NextResponse.json(
      { error: "Provide confirm: true or confirm: false." },
      { status: 400 }
    );
  }

  try {
    if (body.confirm !== true) {
      const result = await runSafeAutoSync(admin.client, { confirm: false });
      if (result.sourceUnavailable) {
        return NextResponse.json(result, { status: 502 });
      }
      return NextResponse.json(result);
    }

    const outcome = await runScheduledZinkGameSync(admin.client, {
      triggerType: "manual",
    });

    if (outcome.kind === "already_running") {
      return NextResponse.json(
        { ok: false, status: "already_running", error: "A sync is already running." },
        { status: 409 }
      );
    }

    if (outcome.kind === "failed") {
      return NextResponse.json(
        { error: outcome.error, status: "failed", runId: outcome.runId },
        { status: 500 }
      );
    }

    if (outcome.kind === "source_unavailable") {
      return NextResponse.json(
        { ...outcome.result, runId: outcome.runId, sourceUnavailable: true },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ...outcome.result,
      runId: outcome.runId,
      durationMs: outcome.durationMs,
    });
  } catch (error) {
    logServerError("admin zinkgame auto sync", error);
    return NextResponse.json(
      { error: toUserError(error) },
      { status: 500 }
    );
  }
}
