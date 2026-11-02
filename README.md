# LAYEMITURBAN — Storefront

A sleek, semi-complete editorial e-commerce storefront built with **HTML + Tailwind (CDN) + vanilla JS**.  
Designed for static hosting on **Cloudflare Pages**.

## Features

- **16 curated products** — 4 hero silhouettes from `prod.json` multiplied into Signature, Bridal, Festive and Everyday editions, shuffled on every load.
- **Shop experience** — search, category filters, price sorting, wishlist, quick-add, product quick-view.
- **Cart** — slide-out bag, quantity controls, free-shipping progress, promo codes (`LAYEMI10`, `WELCOME5`, `TURBAN15`).
- **Accounts** — sign up / sign in, profile, saved delivery address, order history, reorder.
- **Checkout** — 3-step flow (details → delivery → payment), delivery regions & speeds, card / transfer / pay-on-delivery, order confirmation with receipt and WhatsApp hand-off.
- **Persistence** — cart, wishlist, account and orders survive refresh via `localStorage`.
- **Responsive** — mobile drawer, adaptive grids and sticky header.
- **Brand-ready** — real catalogue copy, prices, contact details, Instagram and WhatsApp links from the source data.

> This is a front-end demo: payments are simulated and accounts are stored only in the visitor's browser. No card data leaves the page.

## Run locally

```bash
cd layemiturban
npx serve .
# or: python -m http.server 8080
```

Then visit `http://localhost:3000` (or `:8080`).

## Deploy to Cloudflare Pages

### Option A — Wrangler CLI

```bash
npm i -g wrangler
wrangler login
wrangler pages deploy . --project-name layemiturban
```

### Option B — Dashboard

1. Push this folder to a GitHub repository (or zip it).
2. Go to **Cloudflare Dashboard → Workers & Pages → Create → Pages**.
3. Connect the repo / upload the folder.
4. Framework preset: **None**, build command: *(leave empty)*, output directory: `/` (project root).
5. Deploy.

`_headers` adds sensible security and caching headers automatically. `robots.txt` keeps the site indexable.

## Project structure

```
layemiturban/
├── index.html              # entire storefront (shop, story, overlays)
├── assets/
│   ├── css/styles.css      # editorial theme + components
│   ├── js/products.js      # catalogue generator (16 pieces)
│   ├── js/app.js           # cart, wishlist, auth, checkout
│   └── img/                # optimised product photography
├── prod.json               # source catalogue data
├── _headers                # Cloudflare Pages headers
└── robots.txt
```

## Demo notes

- Create an account during checkout — any email and a 6+ character password works.
- Test card: `4242 4242 4242 4242`, any future expiry (`12/28`), any 3-digit CVC.
- Promo code **LAYEMI10** gives 10% off; domestic shipping is free over ₦75,000.
- Orders appear under **Account → Orders**, with a one-click reorder.

## Customising

- Products: edit `BASE_PRODUCTS` and `EDITIONS` in `assets/js/products.js`.
- Colours/type: Tailwind config lives at the top of `index.html`; component styles in `assets/css/styles.css`.
- Contact links: search for `2349032771661` and `layemiturban`.
