"use strict";

// Database driver adapter (Option 1 — added 2026-11-22).
//
// Default driver ("pg"): server.js builds a normal pg Pool and talks to
// Neon over a direct TCP connection on port 5432. This is the path Render
// uses today and it is unchanged.
//
// Alternative driver ("neon-http"): used on hosts whose platform blocks
// outbound TCP to port 5432 (GoDaddy Node.js hosting returns EACCES).
// Neon's serverless driver sends the same queries to the same database
// over HTTPS (port 443) instead. DATABASE_URL is identical either way.
//
// The HTTP driver is stateless (one HTTPS request per query), so it fits
// this app: every query in server.js / lib/store.js is a single statement,
// only `.rows` is read from results, and there are no transactions or
// pool.connect() calls. fullResults:true keeps results pg-shaped
// ({ rows, rowCount, ... }) so no call site changes.

const { neon } = require("@neondatabase/serverless");

// Neon's HTTP endpoint is served by the direct database host only. A
// "-pooler" (PgBouncer) host does not serve the /sql HTTP API and requests
// to it hang instead of failing, so convert a pooled connection string to
// its direct equivalent for HTTP use. The pg driver path in server.js
// keeps using the original pooled string unchanged. Verified 2026-11-22:
// SELECT 1 via the pooler host over HTTP never returned; via the direct
// host it returned normally in ~5s.
function toHttpConnectionString(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    url.hostname = url.hostname.replace("-pooler", "");
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function createNeonHttpPool(databaseUrl) {
  const sql = neon(toHttpConnectionString(databaseUrl));
  return {
    async query(text, params = []) {
      return sql.query(text, params, { fullResults: true });
    },
    // pg Pool's idle-client error handler has no HTTP equivalent; this
    // no-op keeps the pool.on("error", ...) call site in server.js working.
    on() {},
    // No persistent connection exists, so there is nothing to close on
    // shutdown; keeps the pool.end() call in server.js working.
    async end() {}
  };
}

module.exports = { createNeonHttpPool };
