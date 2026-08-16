import { supabase } from "@/lib/supabase";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProductCard from "@/components/ProductCard";
import ProductGallery from "@/components/ProductGallery";
import PurchaseButtons from "@/components/PurchaseButtons";
import ProductPurchaseBar from "@/components/ProductPurchaseBar";
import FindAccountCTA from "@/components/FindAccountCTA";
import { ChevronRightIcon } from "@/components/icons";
import { formatPrice, SITE_NAME, SITE_URL } from "@/lib/config";
import {
  PUBLIC_PRODUCT_SELECT,
  PUBLIC_PRODUCT_SELECT_LEGACY,
  PUBLIC_PRODUCT_IMAGE_SELECT,
} from "@/lib/products-public";
import {
  getRegionLabel,
  normalizeCurrencyCode,
  normalizeRegionCode,
} from "@/lib/catalog-meta";
import {
  OG_IMAGE_PATH,
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildProductJsonLd,
  buildProductMetaDescription,
  buildProductPageTitle,
} from "@/lib/seo";
import { fetchProductStockSummaryMap } from "@/lib/catalog-stock-server";
import {
  isStorefrontPurchasable,
  resolveCustomerStockDisplayFromSummary,
} from "@/lib/inventory-stock";
import type { Metadata } from "next";
import type { Product } from "@/lib/types";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

function isMissingRegionColumnError(message?: string): boolean {
  if (!message) return false;
  return /region_code/i.test(message) && /column|schema|exist/i.test(message);
}

function isMissingOptionalColumnError(message?: string): boolean {
  if (!message) return false;
  return (
    (/shopee_url|updated_at|region_code/i.test(message) &&
      /column|schema|exist/i.test(message)) ||
    isMissingRegionColumnError(message)
  );
}

async function fetchPublicProductBySlug(slug: string): Promise<{
  data: Product | null;
  error: { message: string } | null;
  select: string;
}> {
  const primary = await supabase
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("slug", slug)
    .single();

  if (!primary.error) {
    return {
      data: primary.data as Product,
      error: null,
      select: PUBLIC_PRODUCT_SELECT,
    };
  }

  if (isMissingOptionalColumnError(primary.error.message)) {
    const legacy = await supabase
      .from("products")
      .select(PUBLIC_PRODUCT_SELECT_LEGACY)
      .eq("slug", slug)
      .single();

    if (!legacy.error) {
      return {
        data: (legacy.data as Product) || null,
        error: null,
        select: PUBLIC_PRODUCT_SELECT_LEGACY,
      };
    }

    const minimalSelect =
      "id,title,slug,description,price,currency,status,server,ar_level,cover_image_url,game_id,created_at";
    const minimal = await supabase
      .from("products")
      .select(minimalSelect)
      .eq("slug", slug)
      .single();

    return {
      data: (minimal.data as Product) || null,
      error: minimal.error,
      select: minimalSelect,
    };
  }

  return {
    data: null,
    error: primary.error,
    select: PUBLIC_PRODUCT_SELECT,
  };
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;

  const { data: product } = await supabase
    .from("products")
    .select(
      "title, description, cover_image_url, price, currency, status, game_id, server, region_code"
    )
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

  const seoFields = {
    title: product.title,
    gameName,
    server: product.server,
    regionCode: product.region_code,
    price: product.price,
    currency: product.currency,
    description: product.description,
  };

  const absoluteTitle = buildProductPageTitle(seoFields);
  const description = buildProductMetaDescription(seoFields);
  const canonical = `${SITE_URL.replace(/\/$/, "")}/product/${slug}`;
  const ogImage = product.cover_image_url || absoluteUrl(OG_IMAGE_PATH);
  const isSold = product.status === "sold";

  return {
    title: { absolute: absoluteTitle },
    description,
    alternates: { canonical },
    robots: isSold
      ? { index: false, follow: true }
      : { index: true, follow: true },
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

  const {
    data: product,
    error,
    select: productSelect,
  } = await fetchPublicProductBySlug(slug);

  if (error || !product || product.status === "hidden") {
    return (
      <main className="storefront-main flex min-h-screen flex-col">
        <Navbar />
        <div className="mx-auto max-w-6xl flex-1 px-6 py-12">
          <h1 className="text-3xl font-bold">Listing not found</h1>
          <p className="mt-3 text-[var(--muted)]">
            This account may no longer be available.
          </p>
          <Link
            href="/products"
            className="mt-6 inline-block text-[var(--accent-strong)] hover:text-[var(--accent)]"
          >
            Browse accounts
          </Link>
        </div>
      </main>
    );
  }

  const [{ data: images }, { data: game }, relatedResult, { data: navGames }] =
    await Promise.all([
      supabase
        .from("product_images")
        .select(PUBLIC_PRODUCT_IMAGE_SELECT)
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
            .select(productSelect)
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

  const related = (relatedResult.data || []) as Product[];
  const relatedStockSummaryByProductId = await fetchProductStockSummaryMap(
    related.map((item) => item.id)
  );

  const productStockSummary = await fetchProductStockSummaryMap([product.id]);
  const stockSummary = productStockSummary[product.id];
  const availableStock = stockSummary?.available_count ?? 0;
  const isListed = product.status === "available";
  const isAvailable = isStorefrontPurchasable({
    productStatus: product.status,
    summary: stockSummary,
  });
  const stockDisplay = resolveCustomerStockDisplayFromSummary({
    productStatus: product.status,
    summary: stockSummary,
  });
  const showInStockSeo =
    isListed &&
    (!stockDisplay.inventoryManaged || availableStock > 0);

  const galleryImages =
    images && images.length > 0
      ? images.map((image) => ({
          id: image.id,
          image_url: image.image_url,
        }))
      : product.cover_image_url
        ? [{ id: "cover", image_url: product.cover_image_url }]
        : [];

  const typedProduct = product as Product;
  const listingCurrency = normalizeCurrencyCode(product.currency);
  const regionCode = normalizeRegionCode(
    (product as Product).region_code
  );
  const regionLabel = getRegionLabel(regionCode);
  const canonical = `${SITE_URL.replace(/\/$/, "")}/product/${slug}`;
  const metaDescription = buildProductMetaDescription({
    title: product.title,
    gameName: game?.name,
    server: product.server,
    regionCode: regionCode,
    price: product.price,
    currency: listingCurrency,
    description: product.description,
  });

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Accounts", path: "/products" },
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
    currency: listingCurrency,
    available: showInStockSeo,
  });

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(breadcrumbItems);

  return (
    <main className="has-purchase-bar storefront-main flex min-h-screen flex-col overflow-x-hidden">
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
        <nav aria-label="Breadcrumb" className="text-xs text-[var(--muted)] sm:text-sm">
          <ol className="flex flex-wrap items-center gap-1.5">
            {breadcrumbItems.map((item, index) => (
              <li key={item.path} className="flex items-center gap-1.5">
                {index > 0 && (
                  <ChevronRightIcon className="h-3 w-3 shrink-0 text-[var(--muted)]" aria-hidden />
                )}
                {index === breadcrumbItems.length - 1 ? (
                  <span className="line-clamp-1 text-[var(--foreground)]" aria-current="page">
                    {item.name}
                  </span>
                ) : (
                  <Link
                    href={item.path}
                    className="transition duration-200 hover:text-[var(--foreground)]"
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
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] transition duration-200 hover:text-[var(--accent-strong)]"
                >
                  {game.name}
                </Link>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={
                    stockDisplay.level === "in_stock" ||
                    stockDisplay.level === "manual_available"
                      ? "inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200"
                      : stockDisplay.level === "low_stock"
                        ? "inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200"
                        : "inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600 ring-1 ring-slate-200"
                  }
                >
                  {stockDisplay.label}
                </span>
              </div>

              <h1 className="mt-4 line-clamp-3 text-2xl font-bold leading-tight tracking-tight text-[var(--foreground)] sm:text-3xl lg:line-clamp-none lg:text-4xl">
                {product.title}
              </h1>

              {(product.server ||
                product.ar_level != null ||
                regionCode) && (
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
                  {regionCode && (
                    <div className="summary-chip">
                      <span className="summary-chip-label">Region</span>
                      <span className="summary-chip-value">
                        {regionLabel && regionLabel.toUpperCase() !== regionCode
                          ? `${regionLabel} · ${regionCode}`
                          : regionCode}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <p className="product-price mt-6">
                {formatPrice(Number(product.price), listingCurrency)}
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--muted-strong)]">
                {stockDisplay.label}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                {listingCurrency}
              </p>

              <div className="mt-6 hidden lg:block">
                <PurchaseButtons
                  product={typedProduct}
                  gameName={game?.name}
                  available={isAvailable}
                  layout="stack"
                  size="lg"
                  mode="full"
                />
              </div>

              <ul className="mt-5 space-y-2 text-xs leading-relaxed text-[var(--muted)] sm:text-sm">
                <li>Delivery is manual after confirmed purchase — not instant.</li>
                <li>Pay by card (Stripe), Shopee, or continue on WhatsApp.</li>
                <li>After-sales help is available via WhatsApp after your purchase.</li>
              </ul>

              <div className="mt-5">
                <FindAccountCTA
                  games={navGames || []}
                  defaultGame={game?.name || ""}
                  variant="secondary"
                  className="w-full min-h-11 px-4 text-sm"
                  label="Looking for something else?"
                />
              </div>
            </div>
          </div>
        </div>

        {product.description && (
          <section className="mt-8 border-t border-[var(--border)] pt-8 lg:mt-10">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Account details</h2>
            <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-white p-5 text-sm leading-7 text-[var(--muted-strong)] shadow-[var(--shadow-card)]">
              {product.description}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-14 border-t border-[var(--border)] pt-10">
            <h2 className="section-title">Related accounts</h2>
            <p className="section-subtitle">
              More available listings from {game?.name || "this game"}
            </p>
            <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {related.map((item) => (
                <ProductCard
                  key={item.id}
                  product={item}
                  gameName={game?.name}
                  stockSummary={relatedStockSummaryByProductId[item.id]}
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
    </main>
  );
}
