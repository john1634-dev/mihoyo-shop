import { supabase } from "@/lib/supabase";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import ProductGallery from "@/components/ProductGallery";
import PurchaseButtons from "@/components/PurchaseButtons";
import ProductPurchaseBar from "@/components/ProductPurchaseBar";
import { ChevronRightIcon } from "@/components/icons";
import { formatPrice, SITE_NAME, SITE_URL } from "@/lib/config";
import { PUBLIC_PRODUCT_SELECT } from "@/lib/products-public";
import {
  OG_IMAGE_PATH,
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildProductJsonLd,
  buildProductMetaDescription,
  buildProductPageTitle,
} from "@/lib/seo";
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
    .select("title, description, cover_image_url, price, currency, status, game_id")
    .eq("slug", slug)
    .single();

  if (!product || product.status === "hidden") {
    return { title: "Product Not Found", robots: { index: false } };
  }

  let gameName: string | null = null;
  if (product.game_id) {
    const { data: game } = await supabase
      .from("games")
      .select("name")
      .eq("id", product.game_id)
      .maybeSingle();
    gameName = game?.name ?? null;
  }

  const pageTitle = gameName
    ? `${product.title} | ${gameName}`
    : product.title;
  const description = buildProductMetaDescription(
    product.title,
    gameName,
    product.description
  );
  const canonical = `${SITE_URL.replace(/\/$/, "")}/product/${slug}`;
  const ogImage = product.cover_image_url || absoluteUrl(OG_IMAGE_PATH);
  const absoluteTitle = buildProductPageTitle(product.title, gameName);

  return {
    title: pageTitle,
    description,
    alternates: { canonical },
    openGraph: {
      title: absoluteTitle,
      description,
      type: "website",
      url: canonical,
      siteName: SITE_NAME,
      images: [{ url: ogImage, alt: product.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: absoluteTitle,
      description,
      images: [ogImage],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  const { data: product, error } = await supabase
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("slug", slug)
    .single();

  if (error || !product || product.status === "hidden") {
    return (
      <main className="flex min-h-screen flex-col bg-slate-950 text-white">
        <Navbar />
        <div className="mx-auto max-w-6xl flex-1 px-6 py-12">
          <h1 className="text-3xl font-bold">Listing not found</h1>
          <p className="mt-3 text-slate-400">
            This account may no longer be available.
          </p>
          <Link
            href="/products"
            className="mt-6 inline-block text-blue-400 hover:text-blue-300"
          >
            Browse accounts
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
            .select(PUBLIC_PRODUCT_SELECT)
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
  const typedProduct = product as Product;
  const canonical = `${SITE_URL.replace(/\/$/, "")}/product/${slug}`;
  const metaDescription = buildProductMetaDescription(
    product.title,
    game?.name,
    product.description
  );

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Games", path: "/products" },
    ...(game
      ? [{ name: game.name, path: `/products?game=${game.slug}` }]
      : []),
    { name: product.title, path: `/product/${slug}` },
  ];

  const productJsonLd = buildProductJsonLd({
    name: product.title,
    description: metaDescription,
    image: product.cover_image_url,
    url: canonical,
    price: Number(product.price),
    currency: product.currency || "MYR",
    available: isAvailable,
  });

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(breadcrumbItems);

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <Navbar games={navGames || []} />

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-purchase-bar md:px-6 md:py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-500 sm:text-sm">
          <ol className="flex flex-wrap items-center gap-1.5">
            {breadcrumbItems.map((item, index) => (
              <li key={item.path} className="flex items-center gap-1.5">
                {index > 0 && (
                  <ChevronRightIcon className="h-3 w-3 shrink-0 text-slate-600" aria-hidden />
                )}
                {index === breadcrumbItems.length - 1 ? (
                  <span className="line-clamp-1 text-slate-400" aria-current="page">
                    {item.name}
                  </span>
                ) : (
                  <Link
                    href={item.path}
                    className="transition duration-200 hover:text-slate-200"
                  >
                    {item.name}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-10 xl:gap-12">
          <ProductGallery title={product.title} images={galleryImages} />

          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="product-info-panel">
              {game && (
                <Link
                  href={`/products?game=${game.slug}`}
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 transition duration-200 hover:text-blue-400"
                >
                  {game.name}
                </Link>
              )}

              <div className="mt-3">
                <span
                  className={
                    isAvailable
                      ? "inline-flex rounded-md bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-500/25"
                      : "inline-flex rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                  }
                >
                  {isAvailable ? "Available" : "Sold Out"}
                </span>
              </div>

              <h1 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
                {product.title}
              </h1>

              {(product.server || product.ar_level != null) && (
                <div className="mt-5 grid grid-cols-2 gap-2 sm:max-w-sm">
                  {product.ar_level != null && (
                    <div className="summary-chip">
                      <span className="summary-chip-label">Level</span>
                      <span className="summary-chip-value">AR {product.ar_level}</span>
                    </div>
                  )}
                  {product.server && (
                    <div className="summary-chip">
                      <span className="summary-chip-label">Server</span>
                      <span className="summary-chip-value">{product.server}</span>
                    </div>
                  )}
                </div>
              )}

              <p className="product-price mt-6">
                {formatPrice(Number(product.price), product.currency || "MYR")}
              </p>

              <div className="mt-6 hidden lg:block">
                <PurchaseButtons
                  product={typedProduct}
                  gameName={game?.name}
                  available={isAvailable}
                  layout="stack"
                  size="lg"
                />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-slate-500 sm:text-sm">
                Purchase via Shopee or WhatsApp. No checkout on this website.
              </p>
            </div>
          </div>
        </div>

        {product.description && (
          <section className="mt-8 border-t border-white/[0.06] pt-8 lg:mt-10">
            <h2 className="text-lg font-semibold text-slate-100">Account details</h2>
            <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/[0.08] bg-slate-900/40 p-5 text-sm leading-7 text-slate-300">
              {product.description}
            </div>
          </section>
        )}

        {related && related.length > 0 && (
          <section className="mt-14 border-t border-white/[0.06] pt-10">
            <h2 className="section-title">Related accounts</h2>
            <p className="section-subtitle">
              More available listings from {game?.name || "this game"}
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
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

      <ProductPurchaseBar
        product={typedProduct}
        gameName={game?.name}
        available={isAvailable}
      />

      <Footer />
    </main>
  );
}
