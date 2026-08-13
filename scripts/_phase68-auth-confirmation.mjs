/**
 * Phase 6.8 — production auth confirmation redirect tests.
 * Run: node --import tsx scripts/_phase68-auth-confirmation.mjs
 */
import { readFileSync } from "node:fs";

const registerPage = readFileSync("app/register/page.tsx", "utf8");
const callbackPage = readFileSync("app/auth/callback/page.tsx", "utf8");
const forgotPasswordPage = readFileSync("app/forgot-password/page.tsx", "utf8");

const results = [];

function pass(name) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

// 1. register page contains emailRedirectTo
if (registerPage.includes("emailRedirectTo")) pass("register_has_email_redirect_to");
else fail("register_has_email_redirect_to");

// 2. register page uses SITE_URL
if (
  registerPage.includes('import { SITE_NAME, SITE_URL } from "@/lib/config"') &&
  registerPage.includes("SITE_URL.replace")
) {
  pass("register_uses_site_url");
} else {
  fail("register_uses_site_url");
}

// 3. redirect points to /auth/callback
if (registerPage.includes("/auth/callback")) pass("register_redirects_to_callback");
else fail("register_redirects_to_callback");

// 4. localhost is not hardcoded into register
if (
  !registerPage.includes("localhost:3000") &&
  !registerPage.includes("https://www.baitugames.com")
) {
  pass("register_no_hardcoded_urls");
} else {
  fail("register_no_hardcoded_urls");
}

// 5. callback page exists
if (callbackPage.includes("AuthCallbackForm")) pass("callback_page_exists");
else fail("callback_page_exists");

// 6. callback handles code query param
if (callbackPage.includes('searchParams.get("code")')) pass("callback_reads_code");
else fail("callback_reads_code");

// 7. callback calls exchangeCodeForSession
if (callbackPage.includes("exchangeCodeForSession")) pass("callback_exchanges_code");
else fail("callback_exchanges_code");

// 8. successful exchange redirects to /account
if (
  callbackPage.includes('router.replace("/account")') &&
  callbackPage.includes("router.refresh()")
) {
  pass("callback_success_redirects_account");
} else {
  fail("callback_success_redirects_account");
}

// 9. missing code is handled
if (
  callbackPage.includes("Invalid confirmation link.") &&
  callbackPage.includes("if (!code)")
) {
  pass("callback_missing_code_handled");
} else {
  fail("callback_missing_code_handled");
}

// 10. exchange failure is handled
if (
  callbackPage.includes("invalid or has expired") &&
  callbackPage.includes("if (exchangeError)")
) {
  pass("callback_exchange_failure_handled");
} else {
  fail("callback_exchange_failure_handled");
}

// 11. callback does not expose the authorization code in HTML
if (
  !callbackPage.includes("{code}") &&
  !callbackPage.includes("searchParams.get(\"code\")}") &&
  !callbackPage.match(/>\s*\{code\}\s*</)
) {
  pass("callback_does_not_render_code");
} else {
  fail("callback_does_not_render_code");
}

// 12. callback does not log sensitive auth data
const sensitiveLogPatterns = [
  /console\.(log|debug|info|warn|error)\([^)]*code/i,
  /console\.(log|debug|info|warn|error)\([^)]*session/i,
  /console\.(log|debug|info|warn|error)\([^)]*token/i,
  /localStorage/,
  /sessionStorage/,
];

if (!sensitiveLogPatterns.some((pattern) => pattern.test(callbackPage))) {
  pass("callback_no_sensitive_logging_or_storage");
} else {
  fail("callback_no_sensitive_logging_or_storage");
}

// 13. referral handling remains present
if (
  registerPage.includes('supabase.rpc("record_referral"') &&
  registerPage.includes("refCode")
) {
  pass("referral_handling_preserved");
} else {
  fail("referral_handling_preserved");
}

// 14. immediate signup session still redirects to /account
if (
  registerPage.includes("if (data.session)") &&
  registerPage.includes('router.replace("/account")')
) {
  pass("immediate_session_redirect_preserved");
} else {
  fail("immediate_session_redirect_preserved");
}

// 15. password reset flow remains unchanged
if (
  forgotPasswordPage.includes("resetPasswordForEmail") &&
  forgotPasswordPage.includes("/reset-password") &&
  forgotPasswordPage.includes("SITE_URL.replace")
) {
  pass("forgot_password_unchanged");
} else {
  fail("forgot_password_unchanged");
}

// Suspense wrapper for useSearchParams (Next.js build requirement)
if (callbackPage.includes("<Suspense")) pass("callback_suspense_wrapper");
else fail("callback_suspense_wrapper");

const failed = results.filter((r) => !r.ok);
console.log(
  `\nPhase 6.8 auth-confirmation: ${results.length - failed.length}/${results.length} passed`
);
if (failed.length) process.exit(1);
