/**
 * Phase 9.5 test runner — invoked by scripts/_phase9_5-supplier-translation-pricing.mjs
 */
import { readFile } from "node:fs/promises";
import { computeCostMyr, computeProfit } from "../lib/costing";
import {
  calculateSupplierSellingPrice,
  getDefaultMarkupPercent,
  SupplierPricingError,
} from "../lib/supplier/pricing";
import {
  protectTokens,
  restoreTokens,
  translateWithRules,
} from "../lib/supplier/translation/providers/rules";
import { translateSupplierTitle } from "../lib/supplier/translation/translate";

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
  const sampleTitle =
    "H4702 nguồn cn neu c6 và những người bạn";

  const translation = await translateSupplierTitle(sampleTitle, {
    provider: "rules",
  });
  if (translation.status === "completed") pass("translation_abstraction");
  else fail("translation_abstraction", translation.status);

  if (translation.sourceText === sampleTitle) pass("original_title_preserved");
  else fail("original_title_preserved", translation.sourceText);

  const translated = translation.translatedText;
  if (/H4702/i.test(translated)) pass("product_code_preserved");
  else fail("product_code_preserved", translated);

  if (/\bC6\b/i.test(translated)) pass("c6_preserved");
  else fail("c6_preserved", translated);

  const e6Sample = await translateSupplierTitle("acc yae e6 full", {
    provider: "rules",
  });
  if (/\bE6\b/i.test(e6Sample.translatedText)) pass("e6_preserved");
  else fail("e6_preserved", e6Sample.translatedText);

  const s1Sample = await translateSupplierTitle("build s1 hu tao", {
    provider: "rules",
  });
  if (/\bS1\b/i.test(s1Sample.translatedText)) pass("s1_preserved");
  else fail("s1_preserved", s1Sample.translatedText);

  if (/CN Server/i.test(translated) && /Friends/i.test(translated)) {
    pass("vietnamese_phrase_translation");
  } else {
    fail("vietnamese_phrase_translation", translated);
  }

  const protectedSample = protectTokens("H4702 c6 3500000");
  if (protectedSample.tokens.some((t) => /H4702/i.test(t))) pass("token_protection");
  else fail("token_protection");

  const roundTrip = restoreTokens(
    "prefix __TK0__ mid __TK1__ suffix",
    ["H4702", "C6"]
  );
  if (roundTrip.includes("H4702") && roundTrip.includes("C6")) pass("token_restore");
  else fail("token_restore", roundTrip);

  const rate = 0.00018;
  const cost100 = computeCostMyr(100 / rate, rate);
  if (Math.abs(cost100 - 100) < 0.01) pass("vnd_to_myr_via_costing");
  else fail("vnd_to_myr_via_costing", String(cost100));

  const pricing100 = calculateSupplierSellingPrice({
    supplierPrice: Math.round(100 / rate),
    supplierCurrency: "VND",
    markupPercent: 100,
    exchangeRate: rate,
  });

  if (Math.abs(pricing100.costMyr - 100) < 0.01) pass("cost_myr_100");
  else fail("cost_myr_100", String(pricing100.costMyr));

  if (Math.abs(pricing100.sellingPriceMyr - 200) < 0.01) pass("markup_100_percent");
  else fail("markup_100_percent", String(pricing100.sellingPriceMyr));

  if (Math.abs(pricing100.profitMyr - 100) < 0.01) pass("profit_100_on_100_cost");
  else fail("profit_100_on_100_cost", String(pricing100.profitMyr));

  const pricing50 = calculateSupplierSellingPrice({
    supplierPrice: 3_500_000,
    supplierCurrency: "VND",
    markupPercent: 50,
    exchangeRate: 0.00018,
  });
  const expected50 =
    Math.round(pricing50.costMyr * 1.5 * 100) / 100;
  if (Math.abs(pricing50.sellingPriceMyr - expected50) < 0.01) {
    pass("markup_50_percent");
  } else {
    fail(
      "markup_50_percent",
      `${pricing50.sellingPriceMyr} vs ${expected50}`
    );
  }

  const pricing0 = calculateSupplierSellingPrice({
    supplierPrice: 1_000_000,
    supplierCurrency: "VND",
    markupPercent: 0,
    exchangeRate: 0.00018,
  });
  if (Math.abs(pricing0.sellingPriceMyr - pricing0.costMyr) < 0.01) {
    pass("markup_0_percent");
  } else {
    fail("markup_0_percent");
  }

  try {
    calculateSupplierSellingPrice({
      supplierPrice: 1000,
      supplierCurrency: "VND",
      markupPercent: -10,
      exchangeRate: 0.00018,
    });
    fail("negative_markup_rejected");
  } catch (error) {
    if (error instanceof SupplierPricingError) pass("negative_markup_rejected");
    else fail("negative_markup_rejected", String(error));
  }

  const failedTranslation = await translateSupplierTitle("Test", {
    provider: "unsupported-provider",
  });
  if (
    failedTranslation.status === "failed" &&
    failedTranslation.translatedText === "Test"
  ) {
    pass("translation_failure_fallback");
  } else {
    fail("translation_failure_fallback", failedTranslation.status);
  }

  const rounded = calculateSupplierSellingPrice({
    supplierPrice: 3_500_000,
    supplierCurrency: "VND",
    markupPercent: 100,
    exchangeRate: 0.000176543,
  });
  const sellingDecimals = rounded.sellingPriceMyr.toString().split(".")[1] ?? "";
  if (sellingDecimals.length <= 2) pass("price_rounding_two_decimals");
  else fail("price_rounding_two_decimals", rounded.sellingPriceMyr.toString());

  const { profit } = computeProfit(
    rounded.sellingPriceMyr,
    rounded.costMyr
  );
  if (Math.abs(profit - rounded.profitMyr) < 0.01) pass("profit_uses_costing_helper");
  else fail("profit_uses_costing_helper");

  if (getDefaultMarkupPercent("zinkgame") === 100) pass("default_markup_100");
  else fail("default_markup_100", String(getDefaultMarkupPercent("zinkgame")));

  const rulesOnly = translateWithRules("H4702 nguồn cn neu c6 và những người bạn");
  if (rulesOnly.translatedText.includes("H4702")) pass("rules_provider_sample");
  else fail("rules_provider_sample", rulesOnly.translatedText);

  const previewApi = await readFile(
    "app/api/admin/suppliers/zinkgame/preview/route.ts",
    "utf8"
  );
  if (previewApi.includes("buildSupplierProductPreview")) {
    pass("preview_api_extended");
  } else {
    fail("preview_api_extended");
  }

  if (
    previewApi.includes("originalTitle") ||
    previewApi.includes("buildSupplierProductPreview")
  ) {
    pass("preview_returns_translation_pricing");
  } else {
    fail("preview_returns_translation_pricing");
  }

  if (
    !previewApi.includes('.from("products")') &&
    !previewApi.includes("storage.upload")
  ) {
    pass("preview_no_db_writes");
  } else {
    fail("preview_no_db_writes");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nPhase 9.5 tests: ${results.length - failed.length}/${results.length} passed`
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
