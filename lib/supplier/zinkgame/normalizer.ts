import type { SupplierProduct, SupplierProductImage } from "@/lib/supplier/types";
import type { ParsedDetail, ParsedListingItem } from "@/lib/supplier/zinkgame/parser";

const SOURCE = "zinkgame";

function normalizeImages(
  images: ParsedDetail["images"]
): SupplierProductImage[] | undefined {
  if (!images.length) return undefined;

  return images.map((image) => ({
    url: image.url,
    sortOrder: image.sortOrder,
    imageSource: "supplier" as const,
    metadata: {
      role: image.role,
    },
  }));
}

/** Map parsed ZinkGame detail into Phase 7 SupplierProduct. */
export function normalizeZinkGameDetail(parsed: ParsedDetail): SupplierProduct {
  const externalProductId = parsed.externalProductId ?? "";
  const title = parsed.title?.trim() || "Untitled listing";

  return {
    source: SOURCE,
    externalProductId,
    externalProductUrl: parsed.externalProductUrl,
    title,
    description: parsed.description,
    price: parsed.price ?? 0,
    currency: parsed.currency ?? "VND",
    status: parsed.status,
    images: normalizeImages(parsed.images),
    metadata: parsed.metadata,
  };
}

/** Map listing discovery item to a partial SupplierProduct (detail fetch still required). */
export function normalizeZinkGameListingItem(
  item: ParsedListingItem
): SupplierProduct {
  const images: SupplierProductImage[] | undefined = item.coverImageUrl
    ? [
        {
          url: item.coverImageUrl,
          sortOrder: 0,
          imageSource: "supplier",
          metadata: { role: "cover", fromListing: true },
        },
      ]
    : undefined;

  return {
    source: SOURCE,
    externalProductId: item.externalProductId,
    externalProductUrl: item.externalProductUrl,
    title: item.title?.trim() || item.externalProductId,
    description: null,
    price: item.sourcePrice ?? 0,
    currency: item.sourceCurrency ?? "VND",
    status: "unknown",
    images,
    metadata: { fromListing: true },
  };
}
