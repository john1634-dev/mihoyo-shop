# Gameslot Deployment Guide

Production-ready checklist for GitHub → Vercel deployment.

## 1. Repository layout

This Git repository root **is** the Next.js app (`package.json` at root).

In Vercel:

- **Root Directory**: leave empty / `.` (do **not** set `/gameslot`)
- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Install Command**: `npm install`
- **Output**: default Next.js

## 2. Local setup

```bash
git clone <your-repo-url>
cd mihoyo-shop   # or whatever the clone folder is named
cp .env.example .env.local
# fill secrets in .env.local
npm install
npm run dev
```

Production check locally:

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

## 3. Environment variables (Vercel)

Set these in Vercel → Project → Settings → Environment Variables
for Production (and Preview if needed):

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Anon/publishable JWT (`eyJ...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only |
| `NEXT_PUBLIC_SITE_URL` | Yes (prod) | `https://your-domain.com` |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret |
| `STRIPE_WEBHOOK_SECRET` | Yes | From Stripe webhook endpoint |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Optional | Digits only |
| `NEXT_PUBLIC_SHOPEE_URL` | Optional | HTTPS URL |
| `RESEND_API_KEY` | Optional | Transactional email |
| `EMAIL_FROM` | Optional | Verified sender |

Never put `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, or
`STRIPE_WEBHOOK_SECRET` in any `NEXT_PUBLIC_*` variable.

## 4. Supabase setup

1. Create a Supabase project.
2. In SQL Editor, run migrations in order (if not already applied):
   - `supabase/master_migration.sql`
   - `supabase/fix_orders_customer_fk.sql`
   - `supabase/fix_admin_bootstrap.sql`
   - `supabase/v3_features.sql`
   - `supabase/v3_hardening.sql`
3. Create public Storage buckets:
   - `product-images`
   - `game-assets` (if used by admin game uploads)
4. Confirm RLS policies from the SQL files are active.
5. Promote your first admin by setting `profiles.is_admin = true` for your user
   (after login once so the profile row exists). Use SQL Editor with service role.

## 5. Stripe setup

1. Enable **FPX** in Stripe payment methods (MYR).
2. Create a webhook endpoint:
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events: `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`,
     `checkout.session.expired`
3. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Use test keys in Preview; live keys only in Production.

## 6. GitHub → Vercel

1. Push this repository to GitHub.
2. Import the repo in Vercel.
3. Add environment variables.
4. Deploy.
5. Point your domain to Vercel and set `NEXT_PUBLIC_SITE_URL` to that domain.
6. Update Stripe webhook URL to the production domain.

## 7. Production checklist

- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] No `.env.local` or secrets in Git
- [ ] Supabase SQL migrations applied
- [ ] Admin user flagged in `profiles`
- [ ] Stripe webhook returns 200 on test events
- [ ] Checkout creates pending order and webhook marks paid
- [ ] Guest order receipt requires matching email
- [ ] Product images load via `next/image` (Supabase host allowed)
- [ ] robots.txt blocks `/admin`, `/account`, `/checkout`, `/cart`

## 8. Security notes

- Payment confirmation comes only from the Stripe webhook (or verified Stripe APIs),
  never from visiting `/orders/success`.
- Checkout prices are calculated server-side from the database.
- Admin UI guards are UX only; every `/api/admin/*` route must verify `is_admin`.
- Rotate any key that was ever committed or shared in chat.
