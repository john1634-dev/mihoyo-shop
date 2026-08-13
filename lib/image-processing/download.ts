import "server-only";

import { isAllowedZinkGameUrl } from "../supplier/config";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
]);

export class ImageDownloadError extends Error {
  readonly url: string;
  readonly status?: number;

  constructor(message: string, url: string, status?: number) {
    super(message);
    this.name = "ImageDownloadError";
    this.url = url;
    this.status = status;
  }
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.startsWith("169.254.")) return true;
  if (host.endsWith(".local")) return true;
  return false;
}

/** SSRF-safe supplier image URL validation — HTTPS only. */
export function isAllowedSupplierImageUrl(source: string, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (isBlockedHost(parsed.hostname)) return false;

  const normalizedSource = source.trim().toLowerCase();
  if (normalizedSource === "zinkgame") {
    return isAllowedZinkGameUrl(parsed.toString());
  }

  return false;
}

async function readResponseBytesLimited(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new ImageDownloadError(
        `Response exceeds ${maxBytes} bytes.`,
        response.url,
        response.status
      );
    }
    return Buffer.from(arrayBuffer);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ImageDownloadError(
        `Response exceeds ${maxBytes} bytes.`,
        response.url,
        response.status
      );
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Buffer.from(merged);
}

export async function downloadSupplierImage(
  source: string,
  imageUrl: string,
  options: { timeoutMs?: number } = {}
): Promise<{ buffer: Buffer; contentType: string; url: string }> {
  const trimmedUrl = imageUrl.trim();
  if (!isAllowedSupplierImageUrl(source, trimmedUrl)) {
    throw new ImageDownloadError(
      "Image URL is not allowed for this supplier source.",
      trimmedUrl
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(trimmedUrl, {
      method: "GET",
      headers: {
        Accept: "image/jpeg,image/png,image/webp",
        "User-Agent":
          "BaituGames-ImagePipeline/1.0 (+https://www.baitugames.com)",
      },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new ImageDownloadError(
        `Image download failed with status ${response.status}.`,
        trimmedUrl,
        response.status
      );
    }

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new ImageDownloadError(
        `Unsupported content type: ${contentType || "unknown"}.`,
        trimmedUrl,
        response.status
      );
    }

    const buffer = await readResponseBytesLimited(response, MAX_IMAGE_BYTES);

    if (process.env.NODE_ENV === "development") {
      console.info("[image-processing:download]", {
        source,
        url: trimmedUrl,
        bytes: buffer.length,
        contentType,
      });
    }

    return { buffer, contentType, url: trimmedUrl };
  } catch (error) {
    if (error instanceof ImageDownloadError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ImageDownloadError("Image download timed out.", trimmedUrl);
    }
    throw new ImageDownloadError(
      error instanceof Error ? error.message : "Image download failed.",
      trimmedUrl
    );
  } finally {
    clearTimeout(timer);
  }
}
