import { supabase } from "@/lib/supabase";
import Link from "next/link";
import BuyNowButton from "@/components/BuyNowButton";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductGallery from "@/components/ProductGallery";
import { formatPrice, SITE_NAME, SITE_URL } from "@/lib/config";
import type { Metadata } from "next";

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

  if (!product) {
    return { title: "Product Not Found" };
  }

  const description =
    product.description?.slice(0, 160) ||
    `${product.title} available at ${SITE_NAME}.`;

  return {
    title: product.title,
    description,
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

  if (error || !product) {
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

  const [{ data: images }, { data: game }] = await Promise.all([
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
  const isHidden = product.status === "hidden";

  if (isHidden) {
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

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar />

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6 md:py-10">
        <Link
          href={
            game?.slug ? `/products?game=${game.slug}` : "/products"
          }
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Back to Store
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
          <ProductGallery title={product.title} images={galleryImages} />

          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className={
                  isAvailable
                    ? "rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400"
                    : "rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400"
                }
              >
                {isAvailable ? "AVAILABLE" : "SOLD OUT"}
              </span>

              {game && (
                <Link
                  href={`/products?game=${game.slug}`}
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-blue-500 hover:text-blue-400"
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
              {product.ar_level !== null && (
                <span className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
                  AR {product.ar_level}
                </span>
              )}
            </div>

            <div className="mt-8">
              <p className="text-sm text-slate-400">Price</p>
              <p className="mt-1 text-4xl font-bold">
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
              <p>✓ Secure checkout</p>
              <p>✓ After-sales support</p>
              <p>✓ Account warranty according to store policy</p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
