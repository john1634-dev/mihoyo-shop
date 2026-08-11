import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase";
import { getSupabaseService } from "@/lib/supabase-service";
import { logServerError, toUserError } from "@/lib/errors";

async function requireAdmin(request: Request) {
  const { user, client } = await getRequestUser(request);

  if (!user) {
    return {
      user: null,
      client,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    logServerError("admin games profile check", error);

    return {
      user: null,
      client,
      response: NextResponse.json(
        { error: toUserError(error.message) },
        { status: 400 }
      ),
    };
  }

  if (!profile?.is_admin) {
    return {
      user: null,
      client,
      response: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return {
    user,
    client,
    response: null,
  };
}

/**
 * GET /api/admin/games
 *
 * Returns all games for the admin dashboard.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const svc = getSupabaseService();

  const { data, error } = await svc
    .from("games")
    .select(
      `
      id,
      name,
      slug,
      description,
      logo_url,
      banner_url,
      mobile_banner_url,
      is_active,
      sort_order,
      created_at,
      updated_at
    `
    )
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
 *
 * Creates a new game.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

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
  const slug = String(body.slug ?? "").trim().toLowerCase();

  if (!name) {
    return NextResponse.json(
      { error: "Game name is required." },
      { status: 400 }
    );
  }

  if (!slug) {
    return NextResponse.json(
      { error: "Game slug is required." },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json(
      {
        error:
          "Slug may only contain lowercase letters, numbers, and hyphens.",
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
    .select()
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
 *
 * Updates an existing game.
 */
export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  let body: {
    id?: string;
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

  const id = String(body.id ?? "").trim();

  if (!id) {
    return NextResponse.json(
      { error: "Game ID is required." },
      { status: 400 }
    );
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
    const slug = String(body.slug).trim().toLowerCase();

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
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

  updates.updated_at = new Date().toISOString();

  const svc = getSupabaseService();

  const { data, error } = await svc
    .from("games")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    logServerError("admin games PATCH", error);

    return NextResponse.json(
      { error: toUserError(error.message) },
      { status: 400 }
    );
  }

  return NextResponse.json({ game: data });
}