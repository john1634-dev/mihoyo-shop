import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase";
import { getSupabaseService } from "@/lib/supabase-service";
import { logServerError, toUserError } from "@/lib/errors";

const BUCKET = "game-assets";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const MAX_BANNER_SIZE = 5 * 1024 * 1024;

type ImageType = "logo" | "banner" | "mobile_banner";

async function requireAdmin(request: Request) {
  const { user, client } = await getRequestUser(request);

  if (!user) {
    return {
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
    logServerError("admin game upload profile check", error);

    return {
      response: NextResponse.json(
        { error: toUserError(error.message) },
        { status: 400 }
      ),
    };
  }

  if (!profile?.is_admin) {
    return {
      response: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return {
    response: null,
    user,
  };
}

function getExtension(contentType: string) {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const formData = await request.formData();

  const gameId = String(formData.get("game_id") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim() as ImageType;
  const file = formData.get("file");

  if (!gameId) {
    return NextResponse.json(
      { error: "Game ID is required." },
      { status: 400 }
    );
  }

  if (!["logo", "banner", "mobile_banner"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid image type." },
      { status: 400 }
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Image file is required." },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPG, PNG, and WebP images are allowed." },
      { status: 400 }
    );
  }

  const maxSize =
    type === "logo" ? MAX_LOGO_SIZE : MAX_BANNER_SIZE;

  if (file.size > maxSize) {
    return NextResponse.json(
      {
        error:
          type === "logo"
            ? "Logo must be 2MB or smaller."
            : "Banner must be 5MB or smaller.",
      },
      { status: 400 }
    );
  }

  const svc = getSupabaseService();

  // Make sure the game exists.
  const { data: game, error: gameError } = await svc
    .from("games")
    .select("id, slug")
    .eq("id", gameId)
    .maybeSingle();

  if (gameError) {
    logServerError("admin game upload lookup", gameError);

    return NextResponse.json(
      { error: toUserError(gameError.message) },
      { status: 400 }
    );
  }

  if (!game) {
    return NextResponse.json(
      { error: "Game not found." },
      { status: 404 }
    );
  }

  const extension = getExtension(file.type);

  if (!extension) {
    return NextResponse.json(
      { error: "Unsupported image format." },
      { status: 400 }
    );
  }

  const folder =
    type === "logo"
      ? "logos"
      : type === "banner"
        ? "banners"
        : "mobile-banners";

  const fileName = `${crypto.randomUUID()}.${extension}`;
  const path = `${folder}/${game.slug}/${fileName}`;

  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await svc.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "31536000",
    });

  if (uploadError) {
    logServerError("admin game image upload", uploadError);

    return NextResponse.json(
      { error: toUserError(uploadError.message) },
      { status: 400 }
    );
  }

  const {
    data: { publicUrl },
  } = svc.storage
    .from(BUCKET)
    .getPublicUrl(path);

  const column =
    type === "logo"
      ? "logo_url"
      : type === "banner"
        ? "banner_url"
        : "mobile_banner_url";

  const { data: updatedGame, error: updateError } = await svc
    .from("games")
    .update({
      [column]: publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gameId)
    .select()
    .single();

  if (updateError) {
    logServerError(
      "admin game image database update",
      updateError
    );

    // Best-effort cleanup if DB update fails.
    await svc.storage
      .from(BUCKET)
      .remove([path]);

    return NextResponse.json(
      { error: toUserError(updateError.message) },
      { status: 400 }
    );
  }

  return NextResponse.json({
    game: updatedGame,
    image: {
      type,
      path,
      url: publicUrl,
    },
  });
}