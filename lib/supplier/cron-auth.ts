import { timingSafeEqual } from "node:crypto";

export const ZINKGAME_SYNC_CRON_SECRET_ENV = "ZINKGAME_SYNC_CRON_SECRET";

export type CronAuthFailure = {
  ok: false;
  status: 401 | 503;
  error: string;
};

export type CronAuthSuccess = {
  ok: true;
};

function secretsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    if (a.length > 0) timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function getCronSecret(): string {
  return process.env[ZINKGAME_SYNC_CRON_SECRET_ENV]?.trim() ?? "";
}

/** Parse Authorization: Bearer <token>. Rejects query/body secrets. */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/**
 * Authenticate scheduled ZinkGame sync.
 * Missing secret in production → 503. Invalid/missing bearer → 401.
 */
export function authorizeZinkGameCronRequest(request: Request): CronAuthSuccess | CronAuthFailure {
  const expected = getCronSecret();
  const isProduction = process.env.NODE_ENV === "production";

  if (!expected) {
    if (isProduction) {
      return {
        ok: false,
        status: 503,
        error: "Scheduled sync is not configured.",
      };
    }
    return {
      ok: false,
      status: 503,
      error: "Scheduled sync is not configured.",
    };
  }

  const provided = readBearerToken(request);
  if (!provided || !secretsEqual(provided, expected)) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  return { ok: true };
}
