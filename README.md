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
SITE_URL=http://localhost:3000
CONTACT_EMAIL=your-business-email@example.com
INSTAGRAM_URL=https://www.instagram.com/your-official-account/
FACEBOOK_URL=https://www.facebook.com/your-official-page/
YOUTUBE_URL=https://www.youtube.com/@your-official-channel
TELEGRAM_URL=https://t.me/your-official-channel
```

Use only your real, verified URLs. Do not paste placeholder links into a public launch.

When you have a real domain, update `SITE_URL` to `https://nexvoratrading.com` (after the domain points to your hosting provider and HTTPS is active).

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
views/partials/        Shared head, navigation and footer
views/legal/           Privacy, terms and risk disclosure pages
public/css/style.css   Responsive styling and reduced-motion-aware animation
public/js/main.js      Mobile navigation and form UX
public/images/nexvora-mark.png Cropped transparent brand emblem
db/schema.sql         PostgreSQL enquiry table and index
server.js              Express routes, health check and enquiry persistence
.env.example           Configuration template
```

## Legal pages are drafts

The privacy notice and terms pages are visibly marked as drafts and must not be treated as final legal documents. Fill in the real business identity, data practices, retention/deletion process, contact details and applicable jurisdiction before launch. The trading risk disclosure explicitly states that trading involves risk and that educational content does not guarantee results.

## Before going live

- Replace the placeholder social/contact settings.
- Confirm the domain and HTTPS settings with your hosting provider.
- Configure PostgreSQL and `DATABASE_URL`.
- Privacy notice and terms are clearly marked drafts and are not ready for publication. Fill in the actual data practices and business details and obtain suitable legal review. Review the trading-risk disclosure for your actual services and jurisdictions.
- Verify all services, offers, regulatory statements and contact details are accurate.
- Test the enquiry flow and inspect `/robots.txt`, `/sitemap.xml`, page metadata and mobile layout.
- Do not commit `.env` or customer enquiry data to Git.


## Reusable interface icons

The project includes `views/partials/icon.ejs`, a reusable SVG icon partial that renders a fixed allowlisted set of icons without a third-party icon library or CDN. Use it in a view with EJS, for example:

```ejs
<%- include("partials/icon", { name: "chart", size: 24 }) %>
```

Within `views/partials/header.ejs` or `views/partials/footer.ejs`, the relative include form is `include("icon", { name: "mail", size: 18 })`. Available symbols are declared in the partial. Keep icon names in that allowlist; arbitrary SVG markup is not accepted from user input. Icons are decorative by default (`aria-hidden="true"`), so links and buttons should retain accessible text or an `aria-label`.
