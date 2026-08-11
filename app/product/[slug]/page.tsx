import { supabase } from "@/lib/supabase";
import Link from "next/link";
import BuyNowButton from "@/components/BuyNowButton";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import ProductGallery from "@/components/ProductGallery";
import { formatPrice, SITE_NAME, SITE_URL } from "@/lib/config";
import type { Metadata } from "next";
import type { Product } from "@/lib/types";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;

  const { data: product } = await supabase
    .from("products")
    .select("title, description, cover_image_url, price, currency, status")
    .eq("slug", slug)
    .single();

  if (!product || product.status === "hidden") {
    return { title: "Product Not Found", robots: { index: false } };
  }

  const description =
    product.description?.slice(0, 160) ||
    `${product.title} available at ${SITE_NAME}.`;

  return {
    title: product.title,
    description,
    alternates: {
      canonical: `${SITE_URL.replace(/\/$/, "")}/product/${slug}`,
    },
    openGraph: {
      title: product.title,
      description,
      type: "website",
      url: `${SITE_URL.replace(/\/$/, "")}/product/${slug}`,
      images: product.cover_image_url
        ? [{ url: product.cover_image_url, alt: product.title }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description,
      images: product.cover_image_url ? [product.cover_image_url] : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !product || product.status === "hidden") {
    return (
      <main className="flex min-h-screen flex-col bg-slate-950 text-white">
        <Navbar />
        <div className="mx-auto max-w-6xl flex-1 px-6 py-12">
          <h1 className="text-3xl font-bold">Product Not Found</h1>
          <Link
            href="/products"
            className="mt-6 inline-block text-blue-400 hover:text-blue-300"
          >
            ← Back to Store
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  const [{ data: images }, { data: game }, { data: related }, { data: navGames }] =
    await Promise.all([
      supabase
        .from("product_images")
        .select("*")
        .eq("product_id", product.id)
        .order("sort_order"),
      product.game_id
        ? supabase
            .from("games")
            .select("id, name, slug")
            .eq("id", product.game_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      product.game_id
        ? supabase
            .from("products")
            .select("*")
            .eq("game_id", product.game_id)
            .eq("status", "available")
            .neq("id", product.id)
            .order("created_at", { ascending: false })
            .limit(4)
        : Promise.resolve({ data: [] as Product[] }),
      supabase
        .from("games")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

  const galleryImages =
    images && images.length > 0
      ? images.map((image) => ({
          id: image.id,
          image_url: image.image_url,
        }))
      : product.cover_image_url
        ? [{ id: "cover", image_url: product.cover_image_url }]
        : [];

  const isAvailable = product.status === "available";

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar games={navGames || []} />

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6 md:py-10">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-400">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-white">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/products" className="hover:text-white">
                Products
              </Link>
            </li>
            {game && (
              <>
                <li aria-hidden="true">/</li>
                <li>
                  <Link
                    href={`/products?game=${game.slug}`}
                    className="hover:text-white"
                  >
                    {game.name}
                  </Link>
                </li>
              </>
            )}
            <li aria-hidden="true">/</li>
            <li className="max-w-[12rem] truncate text-slate-300 sm:max-w-xs">
              {product.title}
            </li>
          </ol>
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
          <ProductGallery title={product.title} images={galleryImages} />

          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className={
                  isAvailable
                    ? "rounded-md bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-400"
                    : "rounded-md bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-red-400"
                }
              >
                {isAvailable ? "Available" : "Sold out"}
              </span>

              {game && (
                <Link
                  href={`/products?game=${game.slug}`}
                  className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-blue-500 hover:text-blue-400"
                >
                  {game.name}
                </Link>
              )}
            </div>

            <h1 className="text-3xl font-bold break-words md:text-4xl">
              {product.title}
            </h1>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {product.server && (
                <span className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
                  Server: {product.server}
                </span>
              )}
              {product.ar_level !== null && product.ar_level !== undefined && (
                <span className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
                  AR {product.ar_level}
                </span>
              )}
            </div>

            <div className="mt-8">
              <p className="text-sm text-slate-400">Price</p>
              <p className="mt-1 text-4xl font-bold tracking-tight">
                {formatPrice(Number(product.price), product.currency || "MYR")}
              </p>
            </div>

            {product.description && (
              <div className="mt-8">
                <h2 className="mb-3 text-lg font-semibold">Account Details</h2>
                <div className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm leading-7 text-slate-300">
                  {product.description}
                </div>
              </div>
            )}

            <div className="mt-8">
              <BuyNowButton
                product={{
                  id: product.id,
                  title: product.title,
                  price: Number(product.price),
                  currency: product.currency || "MYR",
                  image: product.cover_image_url || "",
                }}
                disabled={!isAvailable}
              />
            </div>

            <div className="mt-6 space-y-1 text-sm text-slate-500">
              <p>Secure Stripe FPX checkout</p>
              <p>Manual delivery after payment confirmation</p>
              <p>Warranty according to store refund policy</p>
            </div>
          </div>
        </div>

        {related && related.length > 0 && (
          <section className="mt-16 border-t border-slate-800 pt-12">
            <h2 className="text-2xl font-bold">Related accounts</h2>
            <p className="mt-2 text-sm text-slate-400">
              More available listings from the same game
            </p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard
                  key={item.id}
                  product={item as Product}
                  gameName={game?.name}
                />
              ))}
            </div>
          </section>
        )}
      </section>

      <Footer />
    </main>
  );
}
