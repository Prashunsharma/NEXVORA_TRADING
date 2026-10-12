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
