-- Nexvora website enquiry storage for Neon PostgreSQL.
-- server.js also creates this table and index at startup when DATABASE_URL is configured.
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
);

CREATE INDEX IF NOT EXISTS enquiries_created_at_idx
  ON enquiries (created_at DESC);

-- Admin panel accounts (see README: "Admin panel: offers & testimonials").
-- server.js also creates these tables at startup when DATABASE_URL is configured.
-- Emails are stored lowercased and are unique, giving case-insensitive logins.
CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Homepage offers, managed from /admin. An offer is visible on the site when
-- is_active is true and the current time is inside its optional
-- starts_at / ends_at window.
CREATE TABLE IF NOT EXISTS offers (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_public_id TEXT,
  link_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Homepage testimonials ("Community Feedback"), managed from /admin.
CREATE TABLE IF NOT EXISTS testimonials (
  id BIGSERIAL PRIMARY KEY,
  author_name VARCHAR(100) NOT NULL,
  author_context VARCHAR(160),
  quote TEXT NOT NULL,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  avatar_url TEXT,
  avatar_public_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
