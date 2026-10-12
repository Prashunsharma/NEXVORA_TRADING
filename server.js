require("dotenv").config();

const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const isProduction = process.env.NODE_ENV === "production";
const databaseRequired = isProduction || process.env.DATABASE_REQUIRED === "true";
const DATA_DIR = path.join(__dirname, "data");
const LOCAL_DATA_FILE = path.join(DATA_DIR, "enquiries.json");
const databaseUrl = (process.env.DATABASE_URL || "").trim();
const configuredPoolSize = Number.parseInt(process.env.DATABASE_POOL_MAX || "5", 10);
const databasePoolSize = Number.isFinite(configuredPoolSize)
  ? Math.max(1, Math.min(configuredPoolSize, 20))
  : 5;

const social = {
  instagram: process.env.INSTAGRAM_URL || "",
  facebook: process.env.FACEBOOK_URL || "",
  youtube: process.env.YOUTUBE_URL || "",
  telegram: process.env.TELEGRAM_URL || ""
};
const contactEmail = process.env.CONTACT_EMAIL || "";

// Neon supplies a TLS-ready connection string. Keep its sslmode settings intact rather than
// disabling certificate verification with rejectUnauthorized:false.
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      max: databasePoolSize,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    })
  : null;

if (pool) {
  pool.on("error", (error) => {
    console.error("Unexpected idle PostgreSQL client error:", error.message);
  });
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: isProduction ? "7d" : 0,
  etag: true
}));

app.locals.site = {
  name: "Nexvora Trading & Solution",
  shortName: "NEXVORA",
  tagline: "Learn. Trade. Grow.",
  url: SITE_URL,
  email: contactEmail,
  social,
  databaseConfigured: Boolean(databaseUrl)
};

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Too many enquiries were submitted from this connection. Please wait and try again."
});

async function initializeDatabase() {
  if (!pool) {
    if (databaseRequired) {
      throw new Error("DATABASE_URL is required. Add your Neon PostgreSQL connection string before starting this environment.");
    }
    return;
  }

  // Verify remote connectivity before opening the web server. This also makes /healthz meaningful.
  await pool.query("SELECT 1");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL,
      phone VARCHAR(24) NOT NULL,
      experience VARCHAR(40) NOT NULL,
      country VARCHAR(80),
      market VARCHAR(80),
      goal VARCHAR(100),
      message VARCHAR(2000),
      consent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS enquiries_created_at_idx ON enquiries (created_at DESC)");
  console.log("Remote PostgreSQL connection verified; enquiry table is ready.");
}

async function saveEnquiry(enquiry) {
  if (pool) {
    const result = await pool.query(
      `INSERT INTO enquiries
        (name, email, phone, experience, country, market, goal, message, consent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, created_at`,
      [
        enquiry.name, enquiry.email, enquiry.phone, enquiry.experience,
        enquiry.country || null, enquiry.market || null, enquiry.goal || null,
        enquiry.message || null, enquiry.consent
      ]
    );
    return result.rows[0];
  }

  // Local JSON is intentionally available only during development. Never silently fall back
  // to ephemeral/local storage in production when a remote database is required.
  if (databaseRequired) {
    throw new Error("Remote PostgreSQL is required but DATABASE_URL is not configured.");
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  let entries = [];
  try {
    entries = JSON.parse(await fs.readFile(LOCAL_DATA_FILE, "utf8"));
    if (!Array.isArray(entries)) entries = [];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const saved = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...enquiry, created_at: new Date().toISOString() };
  entries.push(saved);
  await fs.writeFile(LOCAL_DATA_FILE, JSON.stringify(entries, null, 2), { mode: 0o600 });
  return { id: saved.id, created_at: saved.created_at };
}

function clean(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 18;
}

const validExperiences = new Set(["Just exploring", "Beginner", "1–3 years", "More than 3 years"]);
const validMarkets = new Set(["", "Indian equities", "Futures and options", "Forex", "Cryptocurrency", "US markets", "Other / not decided"]);
const validGoals = new Set(["", "Trading fundamentals", "Technical analysis", "Risk management", "Trading psychology", "AI-assisted trading tools", "Market research and analysis"]);

app.get("/healthz", async (req, res) => {
  if (!pool) {
    const healthy = !databaseRequired;
    return res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "error",
      storage: "local-development",
      database: "not-configured"
    });
  }
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    return res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.get("/", (req, res) => {
  res.render("index", {
    title: "Nexvora Trading & Solution | Trading Education & Market Learning",
    description: "Explore trading education, market analysis concepts, risk-aware learning resources and the Nexvora community. Learn. Trade. Grow.",
    canonical: `${SITE_URL}/`,
    page: "home",
    submitted: req.query.sent === "1",
    error: req.query.error || ""
  });
});

app.get("/privacy", (req, res) => {
  res.render("legal/privacy", {
    title: "Privacy Policy | Nexvora Trading & Solution",
    description: "Learn how Nexvora Trading & Solution handles enquiry form information and privacy requests.",
    canonical: `${SITE_URL}/privacy`,
    page: "privacy"
  });
});

app.get("/terms", (req, res) => {
  res.render("legal/terms", {
    title: "Terms & Conditions | Nexvora Trading & Solution",
    description: "Read the terms for using the Nexvora Trading & Solution website and educational content.",
    canonical: `${SITE_URL}/terms`,
    page: "terms"
  });
});

app.get("/risk-disclosure", (req, res) => {
  res.render("legal/risk-disclosure", {
    title: "Trading Risk Disclosure | Nexvora Trading & Solution",
    description: "Understand the risks of trading and the educational-only nature of Nexvora website content.",
    canonical: `${SITE_URL}/risk-disclosure`,
    page: "risk"
  });
});

app.post("/enquiries", enquiryLimiter, async (req, res) => {
  const data = {
    name: clean(req.body.name, 100),
    email: clean(req.body.email, 254).toLowerCase(),
    phone: clean(req.body.phone, 24),
    experience: clean(req.body.experience, 40),
    country: clean(req.body.country, 80),
    market: clean(req.body.market, 80),
    goal: clean(req.body.goal, 100),
    message: clean(req.body.message, 2000),
    consent: req.body.consent === "on"
  };

  // Honeypot field. Return a generic success response to automated submissions.
  if (clean(req.body.website, 200)) return res.redirect(303, "/?sent=1#contact");

  let error = "";
  if (data.name.length < 2) error = "Please enter your full name.";
  else if (!validEmail(data.email)) error = "Please enter a valid email address.";
  else if (!validPhone(data.phone)) error = "Please enter a valid phone number including your country code.";
  else if (!validExperiences.has(data.experience)) error = "Please select your trading experience.";
  else if (!validMarkets.has(data.market)) error = "Please select a valid market option.";
  else if (!validGoals.has(data.goal)) error = "Please select a valid learning goal.";
  else if (!data.consent) error = "Please consent to being contacted about your enquiry.";

  if (error) return res.status(400).render("index", {
    title: "Nexvora Trading & Solution | Trading Education & Market Learning",
    description: "Explore trading education, market analysis concepts, risk-aware learning resources and the Nexvora community.",
    canonical: `${SITE_URL}/`,
    page: "home",
    submitted: false,
    error
  });

  try {
    await saveEnquiry(data);
    return res.redirect(303, "/?sent=1#contact");
  } catch (err) {
    console.error("Unable to save enquiry:", err.message);
    return res.status(500).render("index", {
      title: "Nexvora Trading & Solution | Trading Education & Market Learning",
      description: "Explore trading education, market analysis concepts, risk-aware learning resources and the Nexvora community.",
      canonical: `${SITE_URL}/`,
      page: "home",
      submitted: false,
      error: "We could not save your enquiry right now. Please try again later."
    });
  }
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /enquiries\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (req, res) => {
  const urls = [
    ["/", "1.0", "weekly"],
    ["/privacy", "0.3", "yearly"],
    ["/terms", "0.3", "yearly"],
    ["/risk-disclosure", "0.5", "yearly"]
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(([route, priority, frequency]) => `  <url><loc>${SITE_URL}${route}</loc><changefreq>${frequency}</changefreq><priority>${priority}</priority></url>`).join("\n") +
    `\n</urlset>`;
  res.type("application/xml").send(xml);
});

app.use((req, res) => {
  res.status(404).render("404", {
    title: "Page Not Found | Nexvora Trading & Solution",
    description: "The page you requested could not be found.",
    canonical: `${SITE_URL}${req.path}`,
    page: "404"
  });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  if (res.headersSent) return next(err);
  res.status(500).send("Something went wrong. Please try again later.");
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Nexvora is running at ${SITE_URL}`);
      if (!pool) console.log("Development storage: local JSON. Set DATABASE_URL to enable remote PostgreSQL.");
    });
  })
  .catch(error => {
    console.error("Startup failed:", error.message);
    process.exit(1);
  });

async function shutdown() {
  if (pool) await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
