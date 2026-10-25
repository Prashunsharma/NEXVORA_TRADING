require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const fs = require("fs/promises");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const { createStore } = require("./lib/store");
const cloudinaryLib = require("./lib/cloudinary");

const app = express();
const PORT = Number(process.env.PORT || 3000);
// Public origin used for canonical links, robots.txt and sitemap.xml. Set SITE_URL in the
// environment for each deployment; the default is the production domain, never localhost,
// so a missing env var can never leak development URLs into SEO output.
const SITE_URL = (process.env.SITE_URL || "https://nexvoratrading.com").replace(/\/+$/, "");
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

// Admin content store: admins, offers and testimonials. Uses the same pool
// when DATABASE_URL is configured, otherwise JSON files under data/.
const store = createStore(pool);

// Admin session secret. Set SESSION_SECRET in the environment for stable
// sessions; without it a random per-boot secret is used and every restart
// logs admins out (acceptable for local development only).
let sessionSecret = (process.env.SESSION_SECRET || "").trim();
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET is not set: generated a temporary session secret. Admin sessions will not survive restarts.");
}

// Cloudinary is used for signed direct uploads from the admin panel. All
// three values are required; without them the admin forms fall back to
// pasting an image URL manually.
const cloudinaryConfig = {
  cloudName: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
  apiKey: (process.env.CLOUDINARY_API_KEY || "").trim(),
  apiSecret: (process.env.CLOUDINARY_API_SECRET || "").trim()
};
const cloudinaryConfigured = Boolean(cloudinaryConfig.cloudName && cloudinaryConfig.apiKey && cloudinaryConfig.apiSecret);

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
      // The sha256 hash allows exactly one inline script: the theme initialiser in
      // views/partials/head.ejs. If that script is edited, recompute its hash
      // (sha256 of the exact script body, base64) and update it here.
      scriptSrc: ["'self'", "'sha256-P1lqNgka9feAJas6MAOxfUgY5RmkEtrm4HvlbBW734c='"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      // The admin panel uploads images directly from the browser to
      // Cloudinary using a server-issued signature.
      connectSrc: ["'self'", "https://api.cloudinary.com"],
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

// Sessions are only needed for the /admin panel, but the middleware is cheap
// and keeps the login flow simple. Cookies are hardened per the environment.
app.use(session({
  name: "nexvora.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8
  }
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
  await store.ensureTables();
  console.log("Remote PostgreSQL connection verified; enquiry, admin, offer and testimonial tables are ready.");
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

// Homepage offers/testimonials come from the admin-managed store. A failure
// here must never break the homepage: log it and render with empty lists
// (the sections simply hide themselves).
async function loadHomepageContent() {
  try {
    const [offers, testimonials] = await Promise.all([
      store.listVisibleOffers(),
      store.listVisibleTestimonials()
    ]);
    return { offers, testimonials };
  } catch (error) {
    console.error("Unable to load homepage offers/testimonials:", error.message);
    return { offers: [], testimonials: [] };
  }
}

async function renderHome(res, status, extra) {
  const content = await loadHomepageContent();
  return res.status(status).render("index", {
    title: "Nexvora Trading & Solution | Trading Education & Market Learning",
    description: "Explore trading education, market analysis concepts, risk-aware learning resources and the Nexvora community. Learn. Trade. Grow.",
    canonical: `${SITE_URL}/`,
    page: "home",
    submitted: false,
    error: "",
    offers: content.offers,
    testimonials: content.testimonials,
    offerImageUrl: (url) => cloudinaryLib.deliveryUrl(url, "f_auto,q_auto,w_900"),
    ...extra
  });
}

app.get("/", async (req, res) => {
  await renderHome(res, 200, {
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

  if (error) return renderHome(res, 400, { error });

  try {
    await saveEnquiry(data);
    return res.redirect(303, "/?sent=1#contact");
  } catch (err) {
    console.error("Unable to save enquiry:", err.message);
    return renderHome(res, 500, {
      error: "We could not save your enquiry right now. Please try again later."
    });
  }
});

/* ------------------------------------------------------------------ */
/* Admin panel: login, offers, testimonials, admin accounts            */
/* ------------------------------------------------------------------ */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Too many login attempts from this connection. Please wait and try again."
});

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// Per-request admin setup: guarantee a CSRF token exists, expose view
// locals (token, one-shot flash message, config flags, date formatters).
app.use("/admin", (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.admin = null;
  res.locals.cloudinaryConfigured = cloudinaryConfigured;
  res.locals.formatDate = (value) => (value ? String(value).slice(0, 10) : "—");
  res.locals.formatDateTime = (value) => (value ? String(value).slice(0, 16).replace("T", " ") : "—");
  res.locals.toLocalInput = (value) => (value ? String(value).slice(0, 16) : "");
  next();
});

// Every POST under /admin must carry the per-session CSRF token.
app.use("/admin", (req, res, next) => {
  if (req.method !== "POST") return next();
  const token = req.body && req.body._csrf;
  if (!token || !req.session.csrfToken || token !== req.session.csrfToken) {
    return res.status(403).send("Invalid security token. Please go back and try again.");
  }
  return next();
});

async function requireAdmin(req, res, next) {
  try {
    const adminId = req.session && req.session.adminId;
    if (!adminId) return res.redirect("/admin/login");
    const admin = await store.getAdminById(adminId);
    if (!admin || !admin.is_active) {
      req.session.adminId = null;
      return res.redirect("/admin/login");
    }
    req.admin = admin;
    res.locals.admin = admin;
    return next();
  } catch (error) {
    return next(error);
  }
}

function validUrlOrPath(value) {
  return /^https?:\/\/\S+$/i.test(value) || (value.startsWith("/") && !value.startsWith("//"));
}

// Returns an ISO string, null for blank input, or undefined for bad input.
function parseDateTimeInput(value) {
  const text = clean(value, 40);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function buildOfferPayload(body) {
  const title = clean(body.title, 160);
  const description = clean(body.description, 5000);
  const image_url = clean(body.image_url, 2000);
  const image_public_id = clean(body.image_public_id, 300) || null;
  const linkRaw = clean(body.link_url, 2000);
  const starts_at = parseDateTimeInput(body.starts_at);
  const ends_at = parseDateTimeInput(body.ends_at);
  if (title.length < 2) return { error: "Please enter an offer title (at least 2 characters)." };
  if (!description) return { error: "Please enter an offer description." };
  if (!image_url) return { error: "Please add an offer image: upload one or paste an image URL." };
  if (!validUrlOrPath(image_url)) return { error: "The image URL must start with http://, https:// or /." };
  let link_url = null;
  if (linkRaw) {
    if (!validUrlOrPath(linkRaw)) return { error: "The offer link must start with http://, https:// or /." };
    link_url = linkRaw;
  }
  if (starts_at === undefined || ends_at === undefined) return { error: "Start/end dates must be valid dates, or left blank." };
  if (starts_at && ends_at && Date.parse(ends_at) < Date.parse(starts_at)) return { error: "The end date must be after the start date." };
  const sortOrder = Number.parseInt(body.sort_order, 10);
  return {
    data: {
      title,
      description,
      image_url,
      image_public_id,
      link_url,
      is_active: body.is_active === "on",
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      starts_at,
      ends_at
    }
  };
}

function buildTestimonialPayload(body) {
  const author_name = clean(body.author_name, 100);
  const author_context = clean(body.author_context, 160) || null;
  const quote = clean(body.quote, 5000);
  const avatar_url = clean(body.avatar_url, 2000) || null;
  const avatar_public_id = clean(body.avatar_public_id, 300) || null;
  if (author_name.length < 2) return { error: "Please enter the author's name." };
  if (!quote) return { error: "Please enter the testimonial text." };
  if (avatar_url && !validUrlOrPath(avatar_url)) return { error: "The avatar URL must start with http://, https:// or /." };
  let rating = null;
  const ratingRaw = clean(body.rating, 2);
  if (ratingRaw) {
    rating = Number.parseInt(ratingRaw, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Rating must be a whole number between 1 and 5." };
  }
  const sortOrder = Number.parseInt(body.sort_order, 10);
  return {
    data: {
      author_name,
      author_context,
      quote,
      rating,
      avatar_url,
      avatar_public_id,
      is_active: body.is_active === "on",
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0
    }
  };
}

// Best-effort removal of an uploaded image from Cloudinary when a record is
// deleted or its image replaced. Failures are logged, never fatal.
async function destroyCloudinaryAsset(publicId) {
  if (!publicId || !cloudinaryConfigured) return;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = cloudinaryLib.signParams({ public_id: publicId, timestamp }, cloudinaryConfig.apiSecret);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/destroy`, {
      method: "POST",
      body: new URLSearchParams({
        public_id: publicId,
        timestamp: String(timestamp),
        api_key: cloudinaryConfig.apiKey,
        signature
      })
    });
    if (!response.ok) console.error(`Cloudinary destroy for ${publicId} failed with status ${response.status}.`);
  } catch (error) {
    console.error(`Cloudinary destroy for ${publicId} failed:`, error.message);
  }
}

app.get("/admin/login", (req, res) => {
  if (req.session.adminId) return res.redirect("/admin");
  return res.render("admin/login", { title: "Admin Login | Nexvora", error: "" });
});

app.post("/admin/login", loginLimiter, async (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const fail = () => res.status(401).render("admin/login", {
    title: "Admin Login | Nexvora",
    error: "Invalid email or password."
  });
  try {
    const admin = await store.getAdminByEmail(email);
    if (!admin || !admin.is_active) return fail();
    const matches = await bcrypt.compare(password, admin.password_hash);
    if (!matches) return fail();
    return req.session.regenerate(async (regenerateError) => {
      if (regenerateError) {
        console.error("Session regeneration failed:", regenerateError.message);
        return res.status(500).render("admin/login", { title: "Admin Login | Nexvora", error: "Something went wrong. Please try again." });
      }
      req.session.adminId = admin.id;
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
      try {
        await store.touchAdminLogin(admin.id);
      } catch (touchError) {
        console.error("Unable to record admin login time:", touchError.message);
      }
      return res.redirect("/admin");
    });
  } catch (error) {
    console.error("Admin login failed:", error.message);
    return res.status(500).render("admin/login", { title: "Admin Login | Nexvora", error: "Something went wrong. Please try again." });
  }
});

app.post("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

app.get("/admin", requireAdmin, async (req, res, next) => {
  try {
    const [offers, testimonials, admins] = await Promise.all([
      store.listOffers(),
      store.listTestimonials(),
      store.listAdmins()
    ]);
    return res.render("admin/dashboard", {
      title: "Admin Dashboard | Nexvora",
      counts: {
        offers: offers.length,
        offersActive: offers.filter((offer) => offer.is_active).length,
        testimonials: testimonials.length,
        testimonialsActive: testimonials.filter((entry) => entry.is_active).length,
        admins: admins.length,
        adminsActive: admins.filter((admin) => admin.is_active).length
      }
    });
  } catch (error) {
    return next(error);
  }
});

/* Cloudinary upload signing (browser uploads go straight to Cloudinary) */
app.get("/admin/cloudinary-sign", requireAdmin, (req, res) => {
  if (!cloudinaryConfigured) return res.status(503).json({ error: "not configured" });
  const requested = typeof req.query.folder === "string" ? req.query.folder : "nexvora/offers";
  const folder = /^[a-z0-9/_-]+$/i.test(requested) ? requested : "nexvora/offers";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinaryLib.signParams({ folder, timestamp }, cloudinaryConfig.apiSecret);
  return res.json({
    cloudName: cloudinaryConfig.cloudName,
    apiKey: cloudinaryConfig.apiKey,
    timestamp,
    signature,
    folder
  });
});

/* Offers */
app.get("/admin/offers", requireAdmin, async (req, res, next) => {
  try {
    const offers = await store.listOffers();
    return res.render("admin/offers-list", { title: "Offers | Nexvora Admin", offers });
  } catch (error) {
    return next(error);
  }
});

app.get("/admin/offers/new", requireAdmin, (req, res) => {
  return res.render("admin/offer-form", {
    title: "Add Offer | Nexvora Admin",
    offer: null,
    values: { is_active: true, sort_order: 0 },
    error: ""
  });
});

app.post("/admin/offers", requireAdmin, async (req, res) => {
  const { data, error } = buildOfferPayload(req.body);
  if (error) {
    return res.status(400).render("admin/offer-form", {
      title: "Add Offer | Nexvora Admin",
      offer: null,
      values: req.body,
      error
    });
  }
  try {
    await store.createOffer(data);
    setFlash(req, "success", "Offer created.");
    return res.redirect("/admin/offers");
  } catch (storeError) {
    console.error("Unable to create offer:", storeError.message);
    return res.status(500).render("admin/offer-form", {
      title: "Add Offer | Nexvora Admin",
      offer: null,
      values: req.body,
      error: "We could not save the offer right now. Please try again."
    });
  }
});

app.get("/admin/offers/:id/edit", requireAdmin, async (req, res, next) => {
  try {
    const offer = await store.getOffer(req.params.id);
    if (!offer) return next();
    return res.render("admin/offer-form", {
      title: "Edit Offer | Nexvora Admin",
      offer,
      values: offer,
      error: ""
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/admin/offers/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await store.getOffer(req.params.id);
    if (!existing) return next();
    const { data, error } = buildOfferPayload(req.body);
    if (error) {
      return res.status(400).render("admin/offer-form", {
        title: "Edit Offer | Nexvora Admin",
        offer: existing,
        values: { ...req.body, id: existing.id },
        error
      });
    }
    await store.updateOffer(existing.id, data);
    if (existing.image_public_id && existing.image_public_id !== data.image_public_id) {
      await destroyCloudinaryAsset(existing.image_public_id);
    }
    setFlash(req, "success", "Offer updated.");
    return res.redirect("/admin/offers");
  } catch (error) {
    return next(error);
  }
});

app.post("/admin/offers/:id/toggle", requireAdmin, async (req, res, next) => {
  try {
    const existing = await store.getOffer(req.params.id);
    if (!existing) return next();
    await store.setOfferActive(existing.id, !existing.is_active);
    setFlash(req, "success", existing.is_active ? "Offer hidden from the homepage." : "Offer is now visible on the homepage.");
    return res.redirect("/admin/offers");
  } catch (error) {
    return next(error);
  }
});

app.post("/admin/offers/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    const removed = await store.deleteOffer(req.params.id);
    if (!removed) return next();
    await destroyCloudinaryAsset(removed.image_public_id);
    setFlash(req, "success", "Offer deleted.");
    return res.redirect("/admin/offers");
  } catch (error) {
    return next(error);
  }
});

/* Testimonials */
app.get("/admin/testimonials", requireAdmin, async (req, res, next) => {
  try {
    const testimonials = await store.listTestimonials();
    return res.render("admin/testimonials-list", { title: "Testimonials | Nexvora Admin", testimonials });
  } catch (error) {
    return next(error);
  }
});

app.get("/admin/testimonials/new", requireAdmin, (req, res) => {
  return res.render("admin/testimonial-form", {
    title: "Add Testimonial | Nexvora Admin",
    testimonial: null,
    values: { is_active: true, sort_order: 0 },
    error: ""
  });
});

app.post("/admin/testimonials", requireAdmin, async (req, res) => {
  const { data, error } = buildTestimonialPayload(req.body);
  if (error) {
    return res.status(400).render("admin/testimonial-form", {
      title: "Add Testimonial | Nexvora Admin",
      testimonial: null,
      values: req.body,
      error
    });
  }
  try {
    await store.createTestimonial(data);
    setFlash(req, "success", "Testimonial created.");
    return res.redirect("/admin/testimonials");
  } catch (storeError) {
    console.error("Unable to create testimonial:", storeError.message);
    return res.status(500).render("admin/testimonial-form", {
      title: "Add Testimonial | Nexvora Admin",
      testimonial: null,
      values: req.body,
      error: "We could not save the testimonial right now. Please try again."
    });
  }
});

app.get("/admin/testimonials/:id/edit", requireAdmin, async (req, res, next) => {
  try {
    const testimonial = await store.getTestimonial(req.params.id);
    if (!testimonial) return next();
    return res.render("admin/testimonial-form", {
      title: "Edit Testimonial | Nexvora Admin",
      testimonial,
      values: testimonial,
      error: ""
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/admin/testimonials/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await store.getTestimonial(req.params.id);
    if (!existing) return next();
    const { data, error } = buildTestimonialPayload(req.body);
    if (error) {
      return res.status(400).render("admin/testimonial-form", {
        title: "Edit Testimonial | Nexvora Admin",
        testimonial: existing,
        values: { ...req.body, id: existing.id },
        error
      });
    }
    await store.updateTestimonial(existing.id, data);
    if (existing.avatar_public_id && existing.avatar_public_id !== data.avatar_public_id) {
      await destroyCloudinaryAsset(existing.avatar_public_id);
    }
    setFlash(req, "success", "Testimonial updated.");
    return res.redirect("/admin/testimonials");
  } catch (error) {
    return next(error);
  }
});

app.post("/admin/testimonials/:id/toggle", requireAdmin, async (req, res, next) => {
  try {
    const existing = await store.getTestimonial(req.params.id);
    if (!existing) return next();
    await store.setTestimonialActive(existing.id, !existing.is_active);
    setFlash(req, "success", existing.is_active ? "Testimonial hidden from the homepage." : "Testimonial is now visible on the homepage.");
    return res.redirect("/admin/testimonials");
  } catch (error) {
    return next(error);
  }
});

app.post("/admin/testimonials/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    const removed = await store.deleteTestimonial(req.params.id);
    if (!removed) return next();
    await destroyCloudinaryAsset(removed.avatar_public_id);
    setFlash(req, "success", "Testimonial deleted.");
    return res.redirect("/admin/testimonials");
  } catch (error) {
    return next(error);
  }
});

/* Admin accounts */
app.get("/admin/admins", requireAdmin, async (req, res, next) => {
  try {
    const admins = await store.listAdmins();
    return res.render("admin/admins", { title: "Admin Accounts | Nexvora Admin", admins, values: {}, error: "" });
  } catch (error) {
    return next(error);
  }
});

app.post("/admin/admins", requireAdmin, async (req, res) => {
  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 254).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const renderError = async (message, status = 400) => {
    const admins = await store.listAdmins();
    return res.status(status).render("admin/admins", {
      title: "Admin Accounts | Nexvora Admin",
      admins,
      values: { name, email },
      error: message
    });
  };
  if (name.length < 2) return renderError("Please enter the new admin's name.");
  if (!validEmail(email)) return renderError("Please enter a valid email address.");
  if (password.length < 10) return renderError("Passwords must be at least 10 characters long.");
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await store.createAdmin({ name, email, passwordHash });
    setFlash(req, "success", `Admin account created for ${email}.`);
    return res.redirect("/admin/admins");
  } catch (error) {
    if (error.code === "DUPLICATE_EMAIL") return renderError("An admin with this email already exists.");
    console.error("Unable to create admin:", error.message);
    return renderError("We could not create the admin account right now. Please try again.", 500);
  }
});

app.post("/admin/admins/:id/toggle", requireAdmin, async (req, res, next) => {
  try {
    const target = await store.getAdminById(req.params.id);
    if (!target) return next();
    if (Number(target.id) === Number(req.admin.id)) {
      setFlash(req, "error", "You cannot deactivate your own account.");
      return res.redirect("/admin/admins");
    }
    if (target.is_active) {
      const activeCount = await store.countActiveAdmins();
      if (activeCount <= 1) {
        setFlash(req, "error", "You cannot deactivate the last remaining active admin.");
        return res.redirect("/admin/admins");
      }
    }
    await store.setAdminActive(target.id, !target.is_active);
    setFlash(req, "success", target.is_active ? `Admin ${target.email} deactivated.` : `Admin ${target.email} reactivated.`);
    return res.redirect("/admin/admins");
  } catch (error) {
    return next(error);
  }
});

/* Change password */
app.get("/admin/password", requireAdmin, (req, res) => {
  return res.render("admin/password", { title: "Change Password | Nexvora Admin", error: "" });
});

app.post("/admin/password", requireAdmin, async (req, res, next) => {
  const current = typeof req.body.current_password === "string" ? req.body.current_password : "";
  const nextPassword = typeof req.body.new_password === "string" ? req.body.new_password : "";
  const confirm = typeof req.body.confirm_password === "string" ? req.body.confirm_password : "";
  const renderError = (message) => res.status(400).render("admin/password", { title: "Change Password | Nexvora Admin", error: message });
  try {
    const matches = await bcrypt.compare(current, req.admin.password_hash);
    if (!matches) return renderError("Your current password is incorrect.");
    if (nextPassword.length < 10) return renderError("The new password must be at least 10 characters long.");
    if (nextPassword !== confirm) return renderError("The new password and its confirmation do not match.");
    const passwordHash = await bcrypt.hash(nextPassword, 12);
    await store.updateAdminPassword(req.admin.id, passwordHash);
    setFlash(req, "success", "Password changed.");
    return res.redirect("/admin");
  } catch (error) {
    return next(error);
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
      console.log(`Nexvora is running at http://localhost:${PORT}`);
      console.log(`Public site URL (canonical links, robots.txt, sitemap.xml): ${SITE_URL}`);
      if (!pool) console.log("Development storage: local JSON. Set DATABASE_URL to enable remote PostgreSQL.");
    });
  })
  .catch(error => {
  console.error("Startup failed:", error.code || error.name || "Error", error.message || "(no message)");
  if (error && Array.isArray(error.errors)) {
    for (const sub of error.errors) {
      console.error("  caused by:", sub.code || sub.name || "Error", sub.message || "(no message)", sub.address || "", sub.port || "");
    }
  }
  console.error(error);
  process.exit(1);
});


async function shutdown() {
  if (pool) await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
