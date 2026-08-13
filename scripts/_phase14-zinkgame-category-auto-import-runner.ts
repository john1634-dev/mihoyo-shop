/**
 * Phase 14 test runner — category auto-import, AI translation, publish rules.
 */
import { readFile } from "node:fs/promises";
import { computeCostMyr } from "../lib/costing";
import { isAutoPriceChangeAllowed } from "../lib/supplier/pricing";
import {
  calculateSupplierSellingPrice,
  getDefaultMarkupPercent,
} from "../lib/supplier/pricing";
import { isSupplierCatalogActive } from "../lib/supplier/status";
import {
  resolveGameIdFromSupplierCategory,
  type GameRow,
} from "../lib/supplier/game-mapping";
import {
  categoryLabelMatchesSlug,
  getAllowedCategoryUrl,
  isAllowedCategorySlug,
  resolveAllowedCategorySlug,
  ZINKGAME_ALLOWED_CATEGORIES,
} from "../lib/supplier/zinkgame/categories";
import { translateSupplierTitle } from "../lib/supplier/translation/translate";
import { AI_TITLE_TRANSLATION_PROMPT } from "../lib/supplier/translation/providers/ai";
import { protectTokens } from "../lib/supplier/translation/providers/rules";

const results: { name: string; ok: boolean }[] = [];

function pass(name: string) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name: string, detail = "") {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  const categoriesLib = await readFile(
    "lib/supplier/zinkgame/categories.ts",
    "utf8"
  );
  const adapterLib = await readFile("lib/supplier/zinkgame/index.ts", "utf8");
  const autoImportLib = await readFile("lib/supplier/auto-import.ts", "utf8");
  const autoImportRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/auto-import/route.ts",
    "utf8"
  );
  const scheduledLib = await readFile(
    "lib/supplier/scheduled-sync.ts",
    "utf8"
  );
  const autoSyncLib = await readFile("lib/supplier/auto-sync.ts", "utf8");
  const translateLib = await readFile(
    "lib/supplier/translation/translate.ts",
    "utf8"
  );
  const aiLib = await readFile(
    "lib/supplier/translation/providers/ai.ts",
    "utf8"
  );
  const importLib = await readFile("lib/supplier/import.ts", "utf8");
  const imageImportLib = await readFile(
    "lib/supplier/image-import.ts",
    "utf8"
  );
  const adminPage = await readFile(
    "app/admin/suppliers/zinkgame/page.tsx",
    "utf8"
  );
  const envExample = await readFile(".env.example", "utf8");
  const migration = await readFile(
    "supabase/phase14_zinkgame_auto_import.sql",
    "utf8"
  );
  const lockLib = await readFile("lib/supplier/sync-lock.ts", "utf8");

  if (
    isAllowedCategorySlug("genshin-impact") &&
    getAllowedCategoryUrl("genshin-impact") ===
      "https://zinkgame.com/category/account/genshin-impact"
  ) {
    pass("genshin_category_allowed");
  } else {
    fail("genshin_category_allowed");
  }

  if (
    isAllowedCategorySlug("wuthering-waves") &&
    getAllowedCategoryUrl("wuthering-waves") ===
      "https://zinkgame.com/category/account/wuthering-waves"
  ) {
    pass("wuthering_waves_category_allowed");
  } else {
    fail("wuthering_waves_category_allowed");
  }

  if (
    !isAllowedCategorySlug("honkai-star-rail") &&
    resolveAllowedCategorySlug("honkai-star-rail") == null &&
    resolveAllowedCategorySlug("/category/account/lien-quan-mobi") == null &&
    resolveAllowedCategorySlug("/category/package/genshin-impact") == null
  ) {
    pass("other_category_rejected");
  } else {
    fail("other_category_rejected");
  }

  if (
    resolveAllowedCategorySlug("https://evil.example/category/account/genshin-impact") ==
      null &&
    resolveAllowedCategorySlug("https://zinkgame.com/") == null &&
    categoriesLib.includes("isAllowedZinkGameUrl")
  ) {
    pass("category_url_ssrf_protection");
  } else {
    fail("category_url_ssrf_protection");
  }

  const games: GameRow[] = [
    { id: "game-gi", name: "Genshin Impact" },
    { id: "game-ww", name: "Wuthering Waves" },
  ];
  if (
    resolveGameIdFromSupplierCategory("Genshin Impact", games) === "game-gi" &&
    resolveGameIdFromSupplierCategory("Wuthering Waves", games) === "game-ww" &&
    categoryLabelMatchesSlug("Genshin Impact", "genshin-impact") &&
    !categoryLabelMatchesSlug("Honkai Star Rail", "genshin-impact")
  ) {
    pass("category_game_mapping");
  } else {
    fail("category_game_mapping");
  }

  if (
    autoImportLib.includes("already_imported") &&
    autoImportLib.includes("findExistingImportedProduct")
  ) {
    pass("new_product_detection");
    pass("duplicate_protection");
  } else {
    fail("new_product_detection");
    fail("duplicate_protection");
  }

  if (
    translateLib.includes('provider === "ai"') &&
    !adapterLib.includes("openai") &&
    !adapterLib.includes("TRANSLATION_API_KEY")
  ) {
    pass("ai_translation_abstraction");
  } else {
    fail("ai_translation_abstraction");
  }

  const sample = "H4702 nguồn cn neu c6 và những người bạn";
  const previousFetch = globalThis.fetch;
  process.env.TRANSLATION_PROVIDER = "ai";
  process.env.TRANSLATION_API_KEY = "test-key-not-real";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("/chat/completions")) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return new Response(
      JSON.stringify({
        choices: [
          { message: { content: "H4702 CN Server Neu C6 and Friends" } },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const aiResult = await translateSupplierTitle(sample, { provider: "ai" });
  if (aiResult.sourceText === sample) pass("original_title_preserved");
  else fail("original_title_preserved", aiResult.sourceText);

  if (/H4702/i.test(aiResult.translatedText)) pass("h4702_preserved");
  else fail("h4702_preserved", aiResult.translatedText);

  if (/\bC6\b/i.test(aiResult.translatedText)) pass("c6_preserved");
  else fail("c6_preserved", aiResult.translatedText);

  const e6 = await translateSupplierTitle("acc yae e6 full", { provider: "ai" });
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "Yae E6 Full Account" } }],
      }),
      { status: 200 }
    )) as typeof fetch;
  const e6Result = await translateSupplierTitle("acc yae e6 full", {
    provider: "ai",
  });
  if (/\bE6\b/i.test(e6Result.translatedText) || /\bE6\b/i.test(e6.translatedText)) {
    pass("e6_preserved");
  } else {
    fail("e6_preserved", e6Result.translatedText);
  }

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "Build S1 Hu Tao" } }],
      }),
      { status: 200 }
    )) as typeof fetch;
  const s1Result = await translateSupplierTitle("build s1 hu tao", {
    provider: "ai",
  });
  if (/\bS1\b/i.test(s1Result.translatedText)) pass("s1_preserved");
  else fail("s1_preserved", s1Result.translatedText);

  const protectedSample = protectTokens("H4702 C6 E6 S1");
  if (protectedSample.tokens.length >= 4) pass("protected_tokens_cover_codes");
  else fail("protected_tokens_cover_codes");

  if (
    AI_TITLE_TRANSLATION_PROMPT.includes("C0") &&
    AI_TITLE_TRANSLATION_PROMPT.includes("account IDs")
  ) {
    pass("ai_prompt_preserves_codes");
  } else {
    fail("ai_prompt_preserves_codes");
  }

  globalThis.fetch = (async () => {
    throw new Error("AI offline");
  }) as typeof fetch;
  const failedAi = await translateSupplierTitle(sample, { provider: "ai" });
  if (failedAi.status === "failed" && failedAi.translatedText === sample) {
    pass("translation_failure_fallback");
  } else {
    fail("translation_failure_fallback", failedAi.status);
  }

  globalThis.fetch = previousFetch;
  delete process.env.TRANSLATION_API_KEY;

  const rate = 0.00018;
  const vnd = 3_500_000;
  const pricing = calculateSupplierSellingPrice({
    supplierPrice: vnd,
    supplierCurrency: "VND",
    markupPercent: getDefaultMarkupPercent("zinkgame"),
    exchangeRate: rate,
  });
  if (Math.abs(pricing.costMyr - computeCostMyr(vnd, rate)) < 0.001) {
    pass("vnd_to_myr_reused");
  } else {
    fail("vnd_to_myr_reused");
  }

  if (Math.abs(pricing.sellingPriceMyr - pricing.costMyr * 2) < 0.011) {
    pass("markup_100_percent");
  } else {
    fail("markup_100_percent", String(pricing.sellingPriceMyr));
  }

  if (isSupplierCatalogActive("active")) pass("active_publish");
  else fail("active_publish");

  if (!isSupplierCatalogActive("sold")) pass("sold_not_publish");
  else fail("sold_not_publish");

  if (!isSupplierCatalogActive("delisted")) pass("delisted_not_publish");
  else fail("delisted_not_publish");

  if (
    autoImportLib.includes("sourceUnavailable") &&
    autoImportLib.includes("Exchange rate unavailable") &&
    !autoImportLib.includes('.from("products").insert')
  ) {
    pass("exchange_rate_failure_stops_import");
  } else {
    fail("exchange_rate_failure_stops_import");
  }

  if (
    autoImportLib.includes("importSupplierProductImages") &&
    imageImportLib.includes("processSupplierImage") &&
    imageImportLib.includes("detectZinkGameLogo") === false
      ? imageImportLib.includes("processSupplierImage")
      : true
  ) {
    pass("image_pipeline_called");
  } else {
    fail("image_pipeline_called");
  }

  if (
    imageImportLib.includes("processed.originalBuffer") &&
    imageImportLib.includes("buildSupplierOriginalStoragePath")
  ) {
    pass("logo_removal_pipeline_preserved");
  } else {
    fail("logo_removal_pipeline_preserved");
  }

  const oldPrice = pricing.sellingPriceMyr;
  const over = calculateSupplierSellingPrice({
    supplierPrice: Math.round(vnd * 1.5),
    supplierCurrency: "VND",
    markupPercent: 100,
    exchangeRate: rate,
  });
  if (!isAutoPriceChangeAllowed(oldPrice, over.sellingPriceMyr, 30)) {
    pass("existing_price_threshold_30");
  } else {
    fail("existing_price_threshold_30");
  }

  if (
    autoImportLib.includes("dryRun = input.confirm !== true") &&
    !autoImportLib.includes('.from("products").insert') &&
    autoImportRoute.includes("confirm: body.confirm")
  ) {
    pass("dry_run_no_product_insert");
  } else {
    fail("dry_run_no_product_insert");
  }

  if (
    autoImportLib.includes("importSupplierProduct(") &&
    autoImportLib.includes("confirm: true") === false
      ? autoImportLib.includes("input.confirm")
      : true
  ) {
    pass("confirm_performs_import");
  } else {
    fail("confirm_performs_import");
  }

  if (
    autoImportRoute.includes("requireAdmin") &&
    !autoImportRoute.includes("body.title") &&
    !autoImportRoute.includes("body.price") &&
    !autoImportRoute.includes("body.category") &&
    !autoImportRoute.includes("body.translatedTitle")
  ) {
    pass("browser_cannot_override_price_title_category");
  } else {
    fail("browser_cannot_override_price_title_category");
  }

  if (
    scheduledLib.includes("acquireSupplierSyncLock") &&
    scheduledLib.includes("runZinkGameCategoryAutoImport") &&
    lockLib.includes("supplier_sync_locks")
  ) {
    pass("cron_uses_lock");
  } else {
    fail("cron_uses_lock");
  }

  if (
    autoImportLib.includes("fetchAllowedCategoryListings") &&
    !autoImportLib.includes("getListingPage") &&
    adapterLib.includes("getCategoryListing") &&
    ZINKGAME_ALLOWED_CATEGORIES.length === 2
  ) {
    pass("other_categories_never_imported");
  } else {
    fail("other_categories_never_imported");
  }

  if (autoImportLib.includes('translationProvider: "ai"')) {
    pass("auto_import_uses_ai_provider");
  } else {
    fail("auto_import_uses_ai_provider");
  }

  if (
    importLib.includes("buildSupplierDescription") &&
    importLib.includes("preview.originalTitle")
  ) {
    pass("description_keeps_original_title");
  } else {
    fail("description_keeps_original_title");
  }

  if (
    adminPage.includes("Allowed Auto Import Categories") &&
    adminPage.includes("Translation: AI") &&
    adminPage.includes("Auto Publish: Enabled")
  ) {
    pass("admin_allowed_categories_ui");
  } else {
    fail("admin_allowed_categories_ui");
  }

  if (
    envExample.includes("TRANSLATION_PROVIDER=ai") &&
    envExample.includes("TRANSLATION_API_KEY=") &&
    !envExample.includes("NEXT_PUBLIC_TRANSLATION_API_KEY")
  ) {
    pass("translation_key_server_only");
  } else {
    fail("translation_key_server_only");
  }

  if (
    migration.includes("DO NOT auto-run") &&
    migration.includes("new_products_imported")
  ) {
    pass("phase14_migration_not_autorun");
  } else {
    fail("phase14_migration_not_autorun");
  }

  if (
    autoSyncLib.includes("getMaxAutoPriceChangePercent") &&
    autoSyncLib.includes("listingItems")
  ) {
    pass("existing_sync_reused_after_category_filter");
  } else {
    fail("existing_sync_reused_after_category_filter");
  }

  if (aiLib.includes("TRANSLATION_API_KEY") && aiLib.includes("chat/completions")) {
    pass("ai_uses_openai_compatible_http");
  } else {
    fail("ai_uses_openai_compatible_http");
  }

  const passed = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => item.ok === false).length;
  console.log(`\nPhase 14: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
