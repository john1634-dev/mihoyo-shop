# Gameslot Deployment Guide

Catalogue + WhatsApp / Shopee purchase model (no website payments).

## Repository layout

Git repository root **is** the Next.js app (`package.json` at root).

Vercel:

- **Root Directory**: leave empty / `.`
- **Framework**: Next.js
- **Build**: `npm run build`

## Local setup

```bash
cp .env.example .env.local
# fill Supabase keys
npm install
npm run dev
```

Production check:

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

## Environment variables (Vercel)

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Anon JWT (`eyJ...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only |
| `NEXT_PUBLIC_SITE_URL` | Yes (prod) | `https://your-domain.com` |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Recommended | Digits, e.g. `60102431634` |
| `NEXT_PUBLIC_SHOPEE_URL` | Recommended | `https://shopee.com.my/gameslot` |

Never put `SUPABASE_SERVICE_ROLE_KEY` in any `NEXT_PUBLIC_*` variable.

## Supabase

Run existing migrations as needed, plus optional:

- `supabase/add_product_shopee_url.sql` — optional per-product Shopee link
- `supabase/add_game_image.sql` — game category images + storage bucket

## Purchase flow

1. Customer browses accounts
2. Opens product details
3. Clicks **Buy via WhatsApp** (pre-filled message) or **Buy via Shopee**
4. Completes purchase off-site

## Production checklist

- [ ] lint / typecheck / build pass
- [ ] No `.env.local` in Git
- [ ] WhatsApp and Shopee links open correctly
- [ ] Sold products hide purchase buttons
- [ ] Admin can mark Available / Sold / Hidden
