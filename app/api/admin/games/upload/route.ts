import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { getSupabaseService } from "@/lib/supabase-service";
import { logServerError, toUserError } from "@/lib/errors";
import { extractGameAssetStoragePath } from "@/lib/games";

const BUCKET = "game-assets";
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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

async function removeStoredGameAsset(publicUrl: string | null | undefined) {
  const path = extractGameAssetStoragePath(publicUrl);
  if (!path) return;

  const svc = getSupabaseService();
  await svc.storage.from(BUCKET).remove([path]);
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (isNextResponse(auth)) return auth;

  const formData = await request.formData();

  const gameId = String(formData.get("game_id") ?? "").trim();
  const file = formData.get("file");

  if (!gameId) {
    return NextResponse.json(
      { error: "Game ID is required." },
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

  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json(
      { error: "Image must be 8 MB or smaller." },
      { status: 400 }
    );
  }

  const extension = getExtension(file.type);

  if (!extension) {
    return NextResponse.json(
      { error: "Unsupported image format." },
      { status: 400 }
    );
  }

  const svc = getSupabaseService();

  const { data: game, error: gameError } = await svc
    .from("games")
    .select("id, slug, image_url")
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
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const path = `categories/${game.slug}/${crypto.randomUUID()}.${extension}`;
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
  } = svc.storage.from(BUCKET).getPublicUrl(path);

  const previousImageUrl = game.image_url;

  const { data: updatedGame, error: updateError } = await svc
    .from("games")
    .update({
      image_url: publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gameId)
    .select(GAME_SELECT)
    .single();

  if (updateError) {
    logServerError("admin game image database update", updateError);
    await svc.storage.from(BUCKET).remove([path]);
    return NextResponse.json(
      { error: toUserError(updateError.message) },
      { status: 400 }
    );
  }

  if (previousImageUrl && previousImageUrl !== publicUrl) {
    await removeStoredGameAsset(previousImageUrl);
  }

  return NextResponse.json({
    game: updatedGame,
    image: {
      path,
      url: publicUrl,
    },
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if (isNextResponse(auth)) return auth;

  let body: { game_id?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const gameId = String(body.game_id ?? "").trim();

  if (!gameId) {
    return NextResponse.json(
      { error: "Game ID is required." },
      { status: 400 }
    );
  }

  const svc = getSupabaseService();

  const { data: game, error: gameError } = await svc
    .from("games")
    .select("id, image_url")
    .eq("id", gameId)
    .maybeSingle();

  if (gameError) {
    logServerError("admin game image delete lookup", gameError);
    return NextResponse.json(
      { error: toUserError(gameError.message) },
      { status: 400 }
    );
  }

  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  if (!game.image_url) {
    return NextResponse.json({ success: true, game });
  }

  const previousImageUrl = game.image_url;

  const { data: updatedGame, error: updateError } = await svc
    .from("games")
    .update({
      image_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gameId)
    .select(GAME_SELECT)
    .single();

  if (updateError) {
    logServerError("admin game image delete update", updateError);
    return NextResponse.json(
      { error: toUserError(updateError.message) },
      { status: 400 }
    );
  }

  await removeStoredGameAsset(previousImageUrl);

  return NextResponse.json({ success: true, game: updatedGame });
}
