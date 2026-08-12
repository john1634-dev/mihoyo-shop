import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { getSupabaseService } from "@/lib/supabase-service";
import { logServerError, toUserError } from "@/lib/errors";
import { extractGameAssetStoragePath } from "@/lib/games";

const GAME_SELECT = `
  id,
  name,
  slug,
  description,
  image_url,
  logo_url,
  banner_url,
  mobile_banner_url,
  is_active,
  sort_order,
  created_at,
  updated_at
`;

function parseSlug(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return null;
  }
  return normalized;
}

async function removeStoredGameAsset(publicUrl: string | null | undefined) {
  const path = extractGameAssetStoragePath(publicUrl);
  if (!path) return;

  const svc = getSupabaseService();
  await svc.storage.from("game-assets").remove([path]);
}

/**
 * GET /api/admin/games
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (isNextResponse(auth)) return auth;

  const svc = getSupabaseService();

  const { data, error } = await svc
    .from("games")
    .select(GAME_SELECT)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    logServerError("admin games GET", error);
    return NextResponse.json(
      { error: toUserError(error.message) },
      { status: 400 }
    );
  }

  return NextResponse.json({ games: data ?? [] });
}

/**
 * POST /api/admin/games
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (isNextResponse(auth)) return auth;

  let body: {
    name?: string;
    slug?: string;
    description?: string | null;
    is_active?: boolean;
    sort_order?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const name = String(body.name ?? "").trim();
  const slug = parseSlug(String(body.slug ?? ""));

  if (!name) {
    return NextResponse.json(
      { error: "Game name is required." },
      { status: 400 }
    );
  }

  if (!slug) {
    return NextResponse.json(
      {
        error:
          "Slug is required and may only contain lowercase letters, numbers, and hyphens.",
      },
      { status: 400 }
    );
  }

  const sortOrder = Number.isFinite(Number(body.sort_order))
    ? Number(body.sort_order)
    : 0;

  const svc = getSupabaseService();

  const { data, error } = await svc
    .from("games")
    .insert({
      name,
      slug,
      description:
        body.description === undefined || body.description === null
          ? null
          : String(body.description).trim(),
      is_active: body.is_active ?? true,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    })
    .select(GAME_SELECT)
    .single();

  if (error) {
    logServerError("admin games POST", error);
    return NextResponse.json(
      { error: toUserError(error.message) },
      { status: 400 }
    );
  }

  return NextResponse.json({ game: data }, { status: 201 });
}

/**
 * PATCH /api/admin/games
 */
export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (isNextResponse(auth)) return auth;

  let body: {
    id?: string;
    name?: string;
    slug?: string;
    description?: string | null;
    is_active?: boolean;
    sort_order?: number;
    image_url?: string | null;
    remove_image?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const id = String(body.id ?? "").trim();

  if (!id) {
    return NextResponse.json(
      { error: "Game ID is required." },
      { status: 400 }
    );
  }

  const svc = getSupabaseService();

  const { data: existing, error: existingError } = await svc
    .from("games")
    .select("id, image_url, logo_url, banner_url, mobile_banner_url")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    logServerError("admin games PATCH lookup", existingError);
    return NextResponse.json(
      { error: toUserError(existingError.message) },
      { status: 400 }
    );
  }

  if (!existing) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      return NextResponse.json(
        { error: "Game name cannot be empty." },
        { status: 400 }
      );
    }
    updates.name = name;
  }

  if (body.slug !== undefined) {
    const slug = parseSlug(String(body.slug));
    if (!slug) {
      return NextResponse.json(
        {
          error:
            "Slug may only contain lowercase letters, numbers, and hyphens.",
        },
        { status: 400 }
      );
    }
    updates.slug = slug;
  }

  if (body.description !== undefined) {
    updates.description =
      body.description === null
        ? null
        : String(body.description).trim();
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  if (body.sort_order !== undefined) {
    const sortOrder = Number(body.sort_order);
    if (!Number.isFinite(sortOrder)) {
      return NextResponse.json(
        { error: "Sort order must be a number." },
        { status: 400 }
      );
    }
    updates.sort_order = sortOrder;
  }

  if (body.remove_image) {
    updates.image_url = null;
  } else if (body.image_url !== undefined) {
    updates.image_url =
      body.image_url === null ? null : String(body.image_url).trim();
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await svc
    .from("games")
    .update(updates)
    .eq("id", id)
    .select(GAME_SELECT)
    .single();

  if (error) {
    logServerError("admin games PATCH", error);
    return NextResponse.json(
      { error: toUserError(error.message) },
      { status: 400 }
    );
  }

  if (body.remove_image && existing.image_url) {
    await removeStoredGameAsset(existing.image_url);
  }

  return NextResponse.json({ game: data });
}

/**
 * DELETE /api/admin/games?id=<uuid>
 */
export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if (isNextResponse(auth)) return auth;

  const id = new URL(request.url).searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json(
      { error: "Game ID is required." },
      { status: 400 }
    );
  }

  const svc = getSupabaseService();

  const { data: existing, error: existingError } = await svc
    .from("games")
    .select("id, image_url, logo_url, banner_url, mobile_banner_url")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    logServerError("admin games DELETE lookup", existingError);
    return NextResponse.json(
      { error: toUserError(existingError.message) },
      { status: 400 }
    );
  }

  if (!existing) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const { count, error: productError } = await svc
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("game_id", id);

  if (productError) {
    logServerError("admin games DELETE product check", productError);
    return NextResponse.json(
      { error: toUserError(productError.message) },
      { status: 400 }
    );
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "This game still has linked products. Disable it instead of deleting.",
      },
      { status: 400 }
    );
  }

  const { error } = await svc.from("games").delete().eq("id", id);

  if (error) {
    logServerError("admin games DELETE", error);
    return NextResponse.json(
      { error: toUserError(error.message) },
      { status: 400 }
    );
  }

  await removeStoredGameAsset(existing.image_url);
  await removeStoredGameAsset(existing.logo_url);
  await removeStoredGameAsset(existing.banner_url);
  await removeStoredGameAsset(existing.mobile_banner_url);

  return NextResponse.json({ success: true });
}
