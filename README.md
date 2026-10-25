# Nexvora Trading & Solution — Node.js + Express

A responsive, server-rendered website designed to be edited in VS Code. It uses Express + EJS so important page content and SEO metadata are present in the HTML returned by the server.

## Requirements

- Node.js 20 or newer
- npm (installed with Node.js)
- VS Code

## Run locally

1. Extract this ZIP.
2. Open the extracted `nexvora-nodejs` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Copy `.env.example` to `.env`.
6. Start the development server:

   ```bash
   npm run dev
   ```

   If you prefer not to use auto-reload, run `npm start`.

7. Open `http://localhost:3000`.

## Checks and tests

```bash
npm run check
npm test
```

This is a server-rendered Express + EJS app, so there is no separate frontend build command. `npm run check` checks JavaScript syntax, and `npm test` runs the project regression checks. A full live HTTP/browser test still needs dependencies installed and the app running locally.

## Configure your brand links

Open `.env` and replace the blank values:

```env
SITE_URL=https://nexvoratrading.com
CONTACT_EMAIL=your-business-email@example.com
INSTAGRAM_URL=https://www.instagram.com/your-official-account/
FACEBOOK_URL=https://www.facebook.com/your-official-page/
YOUTUBE_URL=https://www.youtube.com/@your-official-channel
TELEGRAM_URL=https://t.me/your-official-channel
```

Use only your real, verified URLs. Do not paste placeholder links into a public launch.

Keep `SITE_URL` as the production domain even while testing locally: it only controls sitemap/canonical metadata, not the address you browse, so the site still runs at http://localhost:3000 while its sitemap correctly lists nexvoratrading.com URLs.

## Remote database: Neon PostgreSQL

The website is integrated with `node-postgres` (`pg`, already included) and can save enquiries to Neon PostgreSQL. **A live remote database is not connected until you put your own Neon connection string into `.env`**; no credentials are included in this project.

1. Create a project at Neon and open **Connect** in the Neon Console.
2. Select the database and role you want the app to use. Copy the **pooled** connection string for the web application.
3. Put that full connection string into your local `.env` file:

   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@YOUR-POOLER-HOST/DBNAME?sslmode=require&channel_binding=require
   DATABASE_POOL_MAX=5
   DATABASE_REQUIRED=true
   ```

   The line above is an example shape only; replace it with the exact string Neon supplies. Keep it private. Do not put it in browser JavaScript, HTML templates, screenshots, Git or a public issue.
4. Restart with `npm run dev`. Startup performs `SELECT 1`, creates the `enquiries` table and its index if they do not exist, and exits with an error if the configured remote database cannot be reached.
5. Open `http://localhost:3000/healthz`. When the remote connection works, the endpoint responds with `{"status":"ok","database":"connected"}`. It never returns credentials.
6. Submit a test enquiry and verify the row in Neon using the SQL Editor:

   ```sql
   SELECT id, name, email, created_at
   FROM enquiries
   ORDER BY created_at DESC
   LIMIT 10;
   ```

An identical schema is provided at `db/schema.sql` if you prefer to inspect or run the SQL manually. At the moment the app creates the table at startup, so the app's database role needs permission to create it and the index. For stricter least-privilege deployments, provision the schema separately and change runtime migrations to match your deployment process.

### Local development fallback

If `DATABASE_URL` is blank and `DATABASE_REQUIRED=false` in development, submissions are saved to `data/enquiries.json`. This is only for local development, not production. When `NODE_ENV=production`, the application requires `DATABASE_URL` and will not silently store enquiries locally. `DATABASE_REQUIRED=true` also lets you enforce the database while testing locally.

The form includes server-side validation, a honeypot field and a basic IP-based rate limit. Before a public launch, add a CAPTCHA/anti-bot provider if spam becomes an issue, define a retention/deletion process, and secure database access. Do not collect account passwords or payment credentials in the form.

## Admin panel: offers & testimonials

The homepage **Offers** section (below Programs) and the **Community Feedback** testimonials are managed from a built-in admin panel — no code changes are needed to update them.

### Setup

1. Install dependencies (this adds `bcryptjs` and `express-session`):

   ```bash
   npm install
   ```

2. Set the environment variables (see `.env.example`):
   - `SESSION_SECRET` — a long random string used to sign admin session cookies (for example `openssl rand -hex 32`). If it is left blank a temporary secret is generated at every boot and admin sessions reset on restart.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — from your Cloudinary dashboard. These enable direct image uploads in the admin forms. All three are optional: without them the forms accept a pasted image URL instead.

3. Create the first admin account:

   ```bash
   npm run create-admin
   ```

   The script prompts for a name, email and password (minimum 10 characters). It also supports a non-interactive mode via `CREATE_ADMIN_NAME`, `CREATE_ADMIN_EMAIL` and `CREATE_ADMIN_PASSWORD` environment variables.

4. Start the site and sign in at **`/admin/login`**.

### Day-to-day use

- **Offers** (`/admin/offers`): add/edit/delete offers, toggle them visible/hidden, set a sort order and an optional start/end window. A visible offer shows on the homepage only while it is active and inside its window. If an offer has a link, the **whole card** is the link (external links open in a new tab). When no offers are visible, the Offers section does not appear on the homepage at all.
- **Testimonials** (`/admin/testimonials`): same management for the Community Feedback section, with an optional star rating and avatar. The section hides when no testimonial is visible.
- **Admin accounts** (`/admin/admins`): any signed-in admin can add further accounts (2–3 admins work well). Accounts are never deleted — deactivate one to revoke access. You cannot deactivate your own account or the last remaining active admin.
- **Password** (`/admin/password`): each admin can change their own password (current password required, minimum 10 characters).

### Images: Cloudinary upload flow

When Cloudinary is configured, picking a file in an offer/testimonial form uploads it **directly from the browser to Cloudinary** using a short-lived signature issued by the server (`GET /admin/cloudinary-sign`); the server never handles the file bytes. The returned URL and public id are stored with the record, homepage offer images are served with an `f_auto,q_auto,w_900` transformation, and deleting a record (or replacing its image) removes the old asset from Cloudinary on a best-effort basis. Without Cloudinary credentials the upload button reports the problem inline and the "paste an image URL" field remains the way to set an image.

### Storage and tables

Offers, testimonials and admins use the **same dual storage as enquiries**: PostgreSQL when `DATABASE_URL` is set, otherwise JSON files (`data/admins.json`, `data/offers.json`, `data/testimonials.json`) for local development. The `admins`, `offers` and `testimonials` tables are created automatically at startup with `CREATE TABLE IF NOT EXISTS` — you do **not** need to create anything in Neon by hand. If you prefer to provision or inspect the schema manually, the identical SQL is in `db/schema.sql` and can be run in the Neon SQL Editor.

Login is protected by a per-session CSRF token on every admin form, a rate limit of 10 attempts per 15 minutes per IP, bcrypt password hashing (cost 12), and httpOnly session cookies (`nexvora.sid`).

## Day and night themes

Every page supports a dark theme (the default design language) and a light theme, switched with the sun/moon toggle in the header.

- The active theme lives on `<html data-theme="dark|light">`; all colours are CSS custom properties in `public/css/style.css`, with the light palette defined under `[data-theme="light"]`.
- The choice is persisted in `localStorage` under the key `nexvora-theme`. On a first visit the OS `prefers-color-scheme` setting is used.
- A tiny inline script in `views/partials/head.ejs` applies the theme before the stylesheet paints, so there is no flash of the wrong theme. That script is allow-listed in the Content Security Policy by its sha256 hash in `server.js` — **if you edit the inline script, recompute the hash** (sha256 of the exact script body, base64-encoded) and update `scriptSrc` in `server.js`, otherwise the script will be blocked by CSP.
- The chart panel in the hero and the footer intentionally stay dark in both themes (they are "screen" surfaces); their tokens are re-scoped under `[data-theme="light"] .chart-frame` and `.site-footer`.

## Motion and pointer effects

- **Hero canvas** (`public/js/hero-canvas.js`): an animated line chart draws itself behind the hero content with a soft green glow, over the CSS grid and gradient mesh. It is driven by `requestAnimationFrame`, pauses when the hero is off-screen (IntersectionObserver) or the tab is hidden, re-reads its colour from the `--green` token when the theme changes, and renders a single static frame for `prefers-reduced-motion` visitors.
- **Cursor spotlight** (`public/js/main.js`): a soft radial glow follows the pointer with eased lag, and cards (features, program cards, the enquiry form, the chart panel) get a pointer-tracking glow via the `--mx` / `--my` CSS variables. All pointer effects are disabled on touch devices (`pointer: coarse`) and for reduced-motion users.
- **Ambient candlestick background** (`public/js/background-canvas.js`, markup in `views/partials/background.ejs`): a fixed full-viewport canvas behind every page — faint green/red candlesticks (mostly 5–10% opacity, with an occasional brighter highlight candle) drifting slowly sideways over a fine CSS grid, plus tiny glowing dust particles. Colours re-read from the `--green` token on theme change; the loop pauses when the tab is hidden, is throttled to ~30fps, and renders one static frame for reduced-motion visitors. The hero keeps its own brighter foreground chart panel on top of this layer.
- **Custom crosshair cursor** (`public/js/main.js` + `background.ejs` markup): a reticle ring with crosshair ticks and a centre dot follows the pointer on the same rAF loop as the spotlight. Over blank areas it stays small with a mini green/red candlestick pair beside the dot; over links, buttons and other interactive elements the candles hide and the ring expands and glows green. The native cursor is hidden only on fine-pointer devices while the custom cursor is active (`cursor: none`), and never on form fields, which keep their native text/select cursors. Touch and reduced-motion visitors keep the native cursor throughout.
- **Topics marquee** (homepage, below the hero): a pure-CSS scrolling strip — "Market Structure ▲ Risk Management ▼ Trading Psychology ▲ Price Action ▼ Liquidity ▲ Discipline ▼" — alternating solid and outlined text. It pauses on hover and is static (horizontally scrollable) under reduced motion.
- **Fixed ticker bar** (`public/js/ticker.js`, markup in `background.ejs`): a slim dark bar fixed to the bottom of every page with a pulsing LIVE dot and scrolling instruments (NIFTY 50, BANKNIFTY, SENSEX, BTC/USDT, ETH/USDT, GOLD, SOL/USDT). **The values are simulated** — plausible starting values updated by a small random walk every ~2.5 seconds — so the bar carries a visible "Illustrative" label and must never be presented as a live market feed. Body bottom padding keeps it clear of the footer, and the back-to-top button floats above it. Under reduced motion the scrolling stops (the strip can be scrolled manually) while values may still update.
- **Scroll reveals** (`public/js/main.js`): elements marked `data-reveal` fade and rise as they enter the viewport, staggered within their parent group. Content is only hidden after JavaScript opts in, so no-JS and reduced-motion visitors always see everything.

## Production SITE_URL

`SITE_URL` is the public origin used for canonical links, Open Graph URLs, `robots.txt` and `sitemap.xml`.

- **In production `SITE_URL` must be set to the real public origin** (`https://nexvoratrading.com`) in the hosting environment.
- If `SITE_URL` is missing, `server.js` falls back to `https://nexvoratrading.com` — never to `localhost` — so development URLs cannot leak into sitemap or canonical output. For local development, leave `SITE_URL` as the production domain in your local `.env` too (see `.env.example`) — the site still runs at http://localhost:3000, and only its sitemap/canonical metadata uses the production domain.

## Animated Nexvora emblem

The About panel uses the supplied emblem with layered orbital rings, orbiting particles, a soft glow, a gentle floating motion and a moving scan highlight. Animations are CSS-only, have no extra runtime dependencies and are disabled for visitors who prefer reduced motion.

## SEO included

- Server-rendered EJS pages
- Unique title and meta description for the homepage and legal pages
- Canonical URLs derived from `SITE_URL`
- Open Graph tags and JSON-LD Organization structured data
- `robots.txt` and `sitemap.xml`
- Semantic headings and crawlable page content
- Custom 404 page
- Responsive layout and mobile navigation
- Security headers with Helmet

After deploying to your domain, submit `/sitemap.xml` in Google Search Console. SEO does not guarantee ranking; quality content, site speed, authority, useful pages and accurate business information also matter.

## Social media icons

The community section uses locally hosted SVG icons for Instagram, Facebook, YouTube and Telegram in `public/images/social/`. These are visual brand icons; social links remain disabled until real official URLs are set in `.env`. External profile links open in a new tab with `rel="noopener noreferrer"`.

## Main folders

```text
views/                 EJS templates (server-rendered HTML)
views/partials/        Shared head, navigation, footer and the ambient background/cursor/ticker layer
views/legal/           Privacy, terms and risk disclosure pages
views/admin/           Admin panel templates (login, dashboard, offers, testimonials, accounts)
public/css/style.css   Responsive styling and reduced-motion-aware animation
public/css/admin.css   Admin panel styling (standalone dark theme)
public/js/main.js      Mobile navigation, form UX, theme toggle, cursor glow + custom cursor, scroll reveals
public/js/hero-canvas.js Animated hero line-chart background
public/js/background-canvas.js Site-wide ambient candlestick background
public/js/ticker.js    Simulated (illustrative) bottom ticker bar values
public/js/admin.js     Admin panel helpers (Cloudinary uploads, delete confirmations)
lib/store.js           Admins/offers/testimonials store (PostgreSQL or local JSON)
lib/cloudinary.js      Cloudinary request signing and delivery-URL helpers
scripts/create-admin.js  Create an admin account (npm run create-admin)
public/images/nexvora-mark.png Cropped transparent brand emblem
db/schema.sql         PostgreSQL tables: enquiries, admins, offers, testimonials
server.js              Express routes, health check, enquiry persistence and admin panel
.env.example           Configuration template
```

## Legal pages

The privacy notice, terms and risk disclosure are written in publishable language with no internal draft markers, and deliberately avoid stating specifics the business has not confirmed (no invented retention periods, addresses or regulatory claims). They are still templates, not legal advice: have a qualified professional review them for the real business identity, data practices and applicable jurisdiction before relying on them. The trading risk disclosure explicitly states that trading involves risk and that educational content does not guarantee results.

## Before going live

- Replace the placeholder social/contact settings.
- Confirm the domain and HTTPS settings with your hosting provider.
- Configure PostgreSQL and `DATABASE_URL`.
- Have the privacy notice, terms and trading-risk disclosure reviewed by a qualified professional for your actual services and jurisdictions, and confirm the business details they describe are accurate.
- Verify all services, offers, regulatory statements and contact details are accurate.
- Test the enquiry flow and inspect `/robots.txt`, `/sitemap.xml`, page metadata and mobile layout.
- Do not commit `.env` or customer enquiry data to Git.


## Reusable interface icons

The project includes `views/partials/icon.ejs`, a reusable SVG icon partial that renders a fixed allowlisted set of icons without a third-party icon library or CDN. Use it in a view with EJS, for example:

```ejs
<%- include("partials/icon", { name: "chart", size: 24 }) %>
```

Within `views/partials/header.ejs` or `views/partials/footer.ejs`, the relative include form is `include("icon", { name: "mail", size: 18 })`. Available symbols are declared in the partial. Keep icon names in that allowlist; arbitrary SVG markup is not accepted from user input. Icons are decorative by default (`aria-hidden="true"`), so links and buttons should retain accessible text or an `aria-label`.
