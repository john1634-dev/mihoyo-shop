import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/errors";
import { getVndToMyrRate } from "@/lib/exchange-rate";
import { DETAIL_CONCURRENCY } from "@/lib/supplier/auto-sync";
import {
  findExistingImportedProduct,
  importSupplierProduct,
} from "@/lib/supplier/import";
import { importSupplierProductImages } from "@/lib/supplier/image-import";
import {
  extractSupplierCategory,
  loadActiveGames,
  resolveGameIdFromSupplierCategory,
  type GameRow,
} from "@/lib/supplier/game-mapping";
import { buildSupplierProductPreview } from "@/lib/supplier/preview";
import { getDefaultMarkupPercent } from "@/lib/supplier/pricing";
import { isSupplierCatalogActive } from "@/lib/supplier/status";
import type { SupplierListingItem } from "@/lib/supplier/adapter";
import {
  categoryLabelMatchesSlug,
  type ZinkGameAllowedCategorySlug,
} from "@/lib/supplier/zinkgame/categories";
import { zinkgameAdapter } from "@/lib/supplier/zinkgame";
import { fetchAllowedCategoryListings } from "@/lib/supplier/zinkgame";

const SOURCE = "zinkgame";

export type AutoImportAction =
  | "imported"
  | "already_imported"
  | "skipped"
  | "error"
  | "would_import";

export type AutoImportDetail = {
  externalProductId: string;
  category: ZinkGameAllowedCategorySlug;
  title: string;
  translatedTitle: string | null;
  action: AutoImportAction;
  reason: string | null;
  productId?: string | null;
  imagesImported?: number;
};

export type AutoImportResult = {
  dryRun: boolean;
  sourceUnavailable?: boolean;
  checked: number;
  newProducts: number;
  alreadyImported: number;
  skipped: number;
  imported: number;
  translationFailures: number;
  gameMappingFailures: number;
  imageReady: number;
  imagesImported: number;
  errors: number;
  details: AutoImportDetail[];
};

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  async function runWorker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }
  const poolSize = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
}

export { fetchAllowedCategoryListings } from "@/lib/supplier/zinkgame";

type QueueItem = SupplierListingItem & {
  categorySlug: ZinkGameAllowedCategorySlug;
};

function pushDetail(
  result: AutoImportResult,
  detail: AutoImportDetail
): void {
  result.details.push(detail);
  result.checked += 1;
}

export async function runZinkGameCategoryAutoImport(
  client: SupabaseClient,
  input: {
    confirm: boolean;
    listingItems?: QueueItem[];
    exchangeRate?: number;
  }
): Promise<AutoImportResult> {
  const dryRun = input.confirm !== true;
  const markupPercent = getDefaultMarkupPercent(SOURCE);

  const result: AutoImportResult = {
    dryRun,
    checked: 0,
    newProducts: 0,
    alreadyImported: 0,
    skipped: 0,
    imported: 0,
    translationFailures: 0,
    gameMappingFailures: 0,
    imageReady: 0,
    imagesImported: 0,
    errors: 0,
    details: [],
  };

  let exchangeRate = input.exchangeRate;
  if (exchangeRate == null) {
    try {
      const rateResult = await getVndToMyrRate();
      exchangeRate = rateResult.rate;
    } catch (error) {
      logServerError("zinkgame auto-import exchange rate", error);
      return {
        ...result,
        sourceUnavailable: true,
        errors: 1,
        details: [
          {
            externalProductId: "",
            category: "genshin-impact",
            title: "",
            translatedTitle: null,
            action: "error",
            reason: "Exchange rate unavailable.",
          },
        ],
      };
    }
  }

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    return {
      ...result,
      sourceUnavailable: true,
      errors: 1,
      details: [
        {
          externalProductId: "",
          category: "genshin-impact",
          title: "",
          translatedTitle: null,
          action: "error",
          reason: "Exchange rate unavailable.",
        },
      ],
    };
  }

  let queue: QueueItem[];
  if (input.listingItems) {
    queue = input.listingItems;
  } else {
    const fetched = await fetchAllowedCategoryListings();
    if (fetched.items.length === 0 && fetched.errors.length > 0) {
      return {
        ...result,
        sourceUnavailable: true,
        errors: fetched.errors.length,
        details: fetched.errors.map((entry) => ({
          externalProductId: "",
          category: entry.category,
          title: "",
          translatedTitle: null,
          action: "error",
          reason: entry.message,
        })),
      };
    }
    for (const entry of fetched.errors) {
      result.errors += 1;
      result.details.push({
        externalProductId: "",
        category: entry.category,
        title: "",
        translatedTitle: null,
        action: "error",
        reason: entry.message,
      });
    }
    queue = fetched.items;
  }

  let games: GameRow[];
  try {
    games = await loadActiveGames(client);
  } catch (error) {
    logServerError("zinkgame auto-import games", error);
    return {
      ...result,
      errors: result.errors + 1,
      details: [
        ...result.details,
        {
          externalProductId: "",
          category: "genshin-impact",
          title: "",
          translatedTitle: null,
          action: "error",
          reason: "Unable to load games for mapping.",
        },
      ],
    };
  }

  await processWithConcurrency(queue, DETAIL_CONCURRENCY, async (item) => {
    const externalProductId = item.externalProductId.toLowerCase();
    const categorySlug = item.categorySlug;

    try {
      const existing = await findExistingImportedProduct(
        client,
        SOURCE,
        externalProductId
      );
      if (existing) {
        result.alreadyImported += 1;
        pushDetail(result, {
          externalProductId,
          category: categorySlug,
          title: item.title ?? externalProductId,
          translatedTitle: null,
          action: "already_imported",
          reason: "already_imported",
          productId: existing.id,
        });
        return;
      }

      const live = await zinkgameAdapter.getProduct({ productId: externalProductId });
      const liveCategory = extractSupplierCategory(live.metadata);

      if (!categoryLabelMatchesSlug(liveCategory, categorySlug)) {
        result.skipped += 1;
        pushDetail(result, {
          externalProductId,
          category: categorySlug,
          title: live.title,
          translatedTitle: null,
          action: "skipped",
          reason: liveCategory
            ? "invalid_category"
            : "category_undetermined",
        });
        return;
      }

      const gameId = resolveGameIdFromSupplierCategory(liveCategory, games);
      if (!gameId) {
        result.gameMappingFailures += 1;
        result.skipped += 1;
        pushDetail(result, {
          externalProductId,
          category: categorySlug,
          title: live.title,
          translatedTitle: null,
          action: "skipped",
          reason: "game_mapping_required",
        });
        return;
      }

      if (!isSupplierCatalogActive(live.status)) {
        result.skipped += 1;
        pushDetail(result, {
          externalProductId,
          category: categorySlug,
          title: live.title,
          translatedTitle: null,
          action: "skipped",
          reason: `supplier_status_${live.status}`,
        });
        return;
      }

      result.newProducts += 1;
      const imageCount = live.images?.length ?? 0;
      if (imageCount > 0) result.imageReady += 1;

      if (dryRun) {
        const preview = await buildSupplierProductPreview(live, {
          markupPercent,
          translationProvider: "ai",
          exchangeRate,
        });
        if (preview.translationFailed) {
          result.translationFailures += 1;
          logServerError("zinkgame auto-import translation", {
            message: preview.translation.error ?? "Translation failed.",
          });
        }
        pushDetail(result, {
          externalProductId,
          category: categorySlug,
          title: live.title,
          translatedTitle: preview.translatedTitle,
          action: "would_import",
          reason: null,
        });
        return;
      }

      const imported = await importSupplierProduct(client, {
        source: SOURCE,
        productId: externalProductId,
        markupPercent,
        gameId,
        exchangeRate,
        translationProvider: "ai",
        expectedCategorySlug: categorySlug,
      });

      if (!imported.imported) {
        if (imported.reason === "already_imported") {
          result.alreadyImported += 1;
          result.newProducts -= 1;
          pushDetail(result, {
            externalProductId,
            category: categorySlug,
            title: live.title,
            translatedTitle: null,
            action: "already_imported",
            reason: "already_imported",
            productId: imported.productId,
          });
          return;
        }
        if (imported.reason === "game_mapping_required") {
          result.gameMappingFailures += 1;
          result.skipped += 1;
          result.newProducts -= 1;
          pushDetail(result, {
            externalProductId,
            category: categorySlug,
            title: live.title,
            translatedTitle: null,
            action: "skipped",
            reason: "game_mapping_required",
          });
          return;
        }
        if (
          imported.reason === "invalid_category" ||
          imported.reason === "invalid_supplier_status"
        ) {
          result.skipped += 1;
          result.newProducts -= 1;
          pushDetail(result, {
            externalProductId,
            category: categorySlug,
            title: live.title,
            translatedTitle: null,
            action: "skipped",
            reason: imported.reason,
          });
          return;
        }
        result.errors += 1;
        result.newProducts -= 1;
        pushDetail(result, {
          externalProductId,
          category: categorySlug,
          title: live.title,
          translatedTitle: null,
          action: "error",
          reason: imported.reason,
        });
        return;
      }

      result.imported += 1;
      if (imported.translationFailed) {
        result.translationFailures += 1;
      }
      let imagesImported = 0;
      try {
        const images = await importSupplierProductImages(client, {
          productId: imported.productId,
        });
        if (images.imported) {
          imagesImported = images.imagesProcessed;
          result.imagesImported += imagesImported;
        }
      } catch (error) {
        logServerError("zinkgame auto-import images", error);
      }

      pushDetail(result, {
        externalProductId,
        category: categorySlug,
        title: live.title,
        translatedTitle: imported.title,
        action: "imported",
        reason: null,
        productId: imported.productId,
        imagesImported,
      });
    } catch (error) {
      logServerError("zinkgame auto-import product", error);
      result.errors += 1;
      pushDetail(result, {
        externalProductId,
        category: categorySlug,
        title: item.title ?? externalProductId,
        translatedTitle: null,
        action: "error",
        reason:
          error instanceof Error ? error.message : "Product import failed.",
      });
    }
  });

  return result;
}
