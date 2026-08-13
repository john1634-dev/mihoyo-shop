import "server-only";

const DEFAULT_ZINKGAME_BASE_URL = "https://zinkgame.com";

/** ZinkGame public site base URL — override via ZINKGAME_BASE_URL. */
export function getZinkGameBaseUrl(): string {
  const raw = process.env.ZINKGAME_BASE_URL?.trim();
  if (!raw) return DEFAULT_ZINKGAME_BASE_URL;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return DEFAULT_ZINKGAME_BASE_URL;
    }
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_ZINKGAME_BASE_URL;
  }
}

export function getZinkGameOrigin(): string {
  return new URL(getZinkGameBaseUrl()).origin;
}

/** Returns true when `url` is same host as configured ZinkGame base (SSRF guard). */
export function isAllowedZinkGameUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(getZinkGameBaseUrl());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return parsed.hostname.toLowerCase() === base.hostname.toLowerCase();
  } catch {
    return false;
  }
}
