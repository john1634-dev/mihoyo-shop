# V3 Audit Report

## Critical Issues

- **Checkout inventory can get stuck sold when Stripe session creation fails**
  - `app/api/stripe/create-checkout-session/route.ts`
  - `place_store_order` marks products as sold before Stripe session is created; if Stripe create fails, order/products can remain in inconsistent pending+sold state.
  - **Fix:** add server-only compensating rollback RPC and call it on Stripe session create / attach failure.

- **Secrets currently present in local env file (manual operational risk)**
  - `.env.local`
  - Contains live-form secrets (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
  - **Fix:** rotate these keys outside codebase and keep only in deployment secret manager; never commit `.env.local`.

## High Priority

- **Coupon use race / abuse window**
  - `supabase/v3_features.sql`, `app/api/stripe/create-checkout-session/route.ts`
  - Validation and usage increment are split steps, so concurrency can overrun limits.
  - **Fix:** single atomic RPC that re-validates + increments + writes coupon usage in one locked transaction.

- **Internal DB errors leaked to clients**
  - `app/api/wishlist/route.ts`
  - `app/api/reviews/route.ts`
  - `app/api/reviews/[id]/route.ts`
  - `app/api/affiliate/route.ts`
  - `app/api/admin/stats/route.ts`
  - `app/api/admin/analytics/route.ts`
  - **Fix:** return sanitized user-safe messages (`toUserError`/generic), keep raw details only in server logs.

- **Production debug logs expose unnecessary identifiers**
  - `lib/auth.ts`, `components/AdminGuard.tsx`, `app/admin/login/page.tsx`, `app/api/stripe/webhook/route.ts`, `app/api/stripe/create-checkout-session/route.ts`
  - **Fix:** keep concise non-sensitive logs only in development; remove temporary auth/profile debug statements.

## Medium Priority

- **Stripe discount implementation uses negative line item**
  - `app/api/stripe/create-checkout-session/route.ts`
  - Can be brittle depending on Stripe Checkout constraints.
  - **Fix:** keep amounts positive by distributing discount across line items or switch to Stripe-native coupon objects (future enhancement).

- **Guest receipt remains UUID-capability access**
  - `supabase/master_migration.sql` (`get_order_receipt`)
  - Acceptable with UUID entropy, but still requires operational care around link leaks.

- **No API throttling/rate limiting**
  - all `/api/*` routes
  - Operational hardening needed in edge/proxy layer.

## Low Priority

- **Admin mobile layout can overflow on narrow screens**
  - `app/admin/page.tsx`, `app/admin/orders/page.tsx`
  - Horizontal scroll exists and controls can become cramped.

## Mobile Issues

- `app/admin/orders/page.tsx` @ 320/375 widths: table-first layout causes horizontal scrolling.
- `app/admin/page.tsx` @ 320/375 widths: quick-link group can become crowded.
- `app/checkout/page.tsx`: usable but coupon section adds vertical density on very small screens; still functional.

## Database/RLS Issues

- Existing core RLS model is structurally correct for:
  - `profiles`, `orders`, `order_items`, `products`, `games`, `product_images`
- New V3 tables requiring strict checks:
  - `coupons`, `coupon_uses`, `wishlists`, `reviews`, `affiliates`, `referrals`
- Main issue is transactional hardening (coupon apply race), not broad RLS exposure.

## Stripe Issues

- Webhook signature verification order is correct (`constructEvent` before DB mutation).
- Stripe state-change RPCs are restricted to `service_role` (expected design).
- Need compensating rollback on checkout session creation failure.

## Environment Issues

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must be valid Supabase anon/publishable key for client auth/RLS behavior.
- Server-only vars required and must not be exposed:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `RESEND_API_KEY`

