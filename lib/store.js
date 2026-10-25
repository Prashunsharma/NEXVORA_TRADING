// Content store for admins, offers and testimonials.
//
// Mirrors the enquiry storage approach in server.js: when a PostgreSQL pool
// is supplied the data lives in Neon/PostgreSQL tables (created with
// CREATE TABLE IF NOT EXISTS at startup); otherwise it falls back to JSON
// files under data/ for local development. Both modes expose the same async
// API and record shape (snake_case fields, numeric ids, ISO timestamps in
// JSON mode / Date objects from pg are normalised to ISO strings).
const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

function createStore(pool) {
  const usePg = Boolean(pool);

  // ---------- shared helpers ----------
  function normaliseRow(row) {
    if (!row) return null;
    const out = { ...row };
    if (out.id !== undefined) out.id = Number(out.id);
    if (out.sort_order !== undefined && out.sort_order !== null) out.sort_order = Number(out.sort_order);
    for (const key of ["starts_at", "ends_at", "created_at", "updated_at", "last_login_at"]) {
      if (out[key] instanceof Date) out[key] = out[key].toISOString();
    }
    return out;
  }

  function sortRecords(records) {
    return records.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return String(b.created_at).localeCompare(String(a.created_at));
    });
  }

  function isVisibleOffer(offer, now = Date.now()) {
    if (!offer.is_active) return false;
    if (offer.starts_at && Date.parse(offer.starts_at) > now) return false;
    if (offer.ends_at && Date.parse(offer.ends_at) < now) return false;
    return true;
  }

  // ---------- JSON file helpers ----------
  function jsonFile(name) {
    return path.join(DATA_DIR, `${name}.json`);
  }

  async function readJson(name) {
    try {
      const parsed = JSON.parse(await fs.readFile(jsonFile(name), "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function writeJson(name, records) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(jsonFile(name), JSON.stringify(records, null, 2), { mode: 0o600 });
  }

  function nextId(records) {
    return records.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0) + 1;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  // ---------- schema ----------
  async function ensureTables() {
    if (!usePg) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(254) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
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
      )
    `);
    await pool.query(`
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
      )
    `);
  }

  // ---------- admins ----------
  async function listAdmins() {
    if (usePg) {
      const result = await pool.query("SELECT * FROM admins ORDER BY created_at ASC");
      return result.rows.map(normaliseRow);
    }
    const records = await readJson("admins");
    return records.map(normaliseRow).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  async function getAdminByEmail(email) {
    const target = String(email || "").toLowerCase();
    if (usePg) {
      const result = await pool.query("SELECT * FROM admins WHERE LOWER(email) = $1", [target]);
      return normaliseRow(result.rows[0]);
    }
    const records = await readJson("admins");
    return normaliseRow(records.find((record) => String(record.email).toLowerCase() === target) || null);
  }

  async function getAdminById(id) {
    if (usePg) {
      const result = await pool.query("SELECT * FROM admins WHERE id = $1", [id]);
      return normaliseRow(result.rows[0]);
    }
    const records = await readJson("admins");
    return normaliseRow(records.find((record) => Number(record.id) === Number(id)) || null);
  }

  async function createAdmin({ name, email, passwordHash }) {
    const normalisedEmail = String(email).toLowerCase();
    if (await getAdminByEmail(normalisedEmail)) {
      const error = new Error("An admin with this email already exists.");
      error.code = "DUPLICATE_EMAIL";
      throw error;
    }
    if (usePg) {
      try {
        const result = await pool.query(
          "INSERT INTO admins (name, email, password_hash) VALUES ($1,$2,$3) RETURNING *",
          [name, normalisedEmail, passwordHash]
        );
        return normaliseRow(result.rows[0]);
      } catch (error) {
        if (error.code === "23505") {
          const duplicate = new Error("An admin with this email already exists.");
          duplicate.code = "DUPLICATE_EMAIL";
          throw duplicate;
        }
        throw error;
      }
    }
    const records = await readJson("admins");
    const record = {
      id: nextId(records),
      name,
      email: normalisedEmail,
      password_hash: passwordHash,
      is_active: true,
      created_at: nowIso(),
      last_login_at: null
    };
    records.push(record);
    await writeJson("admins", records);
    return normaliseRow(record);
  }

  async function setAdminActive(id, isActive) {
    if (usePg) {
      const result = await pool.query(
        "UPDATE admins SET is_active = $2 WHERE id = $1 RETURNING *",
        [id, isActive]
      );
      return normaliseRow(result.rows[0]);
    }
    const records = await readJson("admins");
    const record = records.find((entry) => Number(entry.id) === Number(id));
    if (!record) return null;
    record.is_active = Boolean(isActive);
    await writeJson("admins", records);
    return normaliseRow(record);
  }

  async function updateAdminPassword(id, passwordHash) {
    if (usePg) {
      const result = await pool.query(
        "UPDATE admins SET password_hash = $2 WHERE id = $1 RETURNING *",
        [id, passwordHash]
      );
      return normaliseRow(result.rows[0]);
    }
    const records = await readJson("admins");
    const record = records.find((entry) => Number(entry.id) === Number(id));
    if (!record) return null;
    record.password_hash = passwordHash;
    await writeJson("admins", records);
    return normaliseRow(record);
  }

  async function touchAdminLogin(id) {
    if (usePg) {
      await pool.query("UPDATE admins SET last_login_at = NOW() WHERE id = $1", [id]);
      return;
    }
    const records = await readJson("admins");
    const record = records.find((entry) => Number(entry.id) === Number(id));
    if (record) {
      record.last_login_at = nowIso();
      await writeJson("admins", records);
    }
  }

  async function countActiveAdmins() {
    const admins = await listAdmins();
    return admins.filter((admin) => admin.is_active).length;
  }

  // ---------- generic content (offers / testimonials) ----------
  function makeContentApi(table) {
    const api = {
      async listAll() {
        if (usePg) {
          const result = await pool.query(`SELECT * FROM ${table} ORDER BY sort_order ASC, created_at DESC`);
          return result.rows.map(normaliseRow);
        }
        return sortRecords((await readJson(table)).map(normaliseRow));
      },

      async getById(id) {
        if (usePg) {
          const result = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
          return normaliseRow(result.rows[0]);
        }
        const records = await readJson(table);
        return normaliseRow(records.find((record) => Number(record.id) === Number(id)) || null);
      },

      async create(data) {
        if (usePg) {
          const keys = Object.keys(data);
          const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
          const result = await pool.query(
            `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
            keys.map((key) => data[key])
          );
          return normaliseRow(result.rows[0]);
        }
        const records = await readJson(table);
        const timestamp = nowIso();
        const record = { id: nextId(records), ...data, created_at: timestamp, updated_at: timestamp };
        records.push(record);
        await writeJson(table, records);
        return normaliseRow(record);
      },

      async update(id, data) {
        if (usePg) {
          const keys = Object.keys(data);
          const assignments = keys.map((key, index) => `${key} = $${index + 1}`).join(", ");
          const result = await pool.query(
            `UPDATE ${table} SET ${assignments}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
            [...keys.map((key) => data[key]), id]
          );
          return normaliseRow(result.rows[0]);
        }
        const records = await readJson(table);
        const record = records.find((entry) => Number(entry.id) === Number(id));
        if (!record) return null;
        Object.assign(record, data);
        record.updated_at = nowIso();
        await writeJson(table, records);
        return normaliseRow(record);
      },

      async remove(id) {
        if (usePg) {
          const result = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]);
          return normaliseRow(result.rows[0]);
        }
        const records = await readJson(table);
        const index = records.findIndex((record) => Number(record.id) === Number(id));
        if (index === -1) return null;
        const [removed] = records.splice(index, 1);
        await writeJson(table, records);
        return normaliseRow(removed);
      },

      async setActive(id, isActive) {
        return api.update(id, { is_active: Boolean(isActive) });
      }
    };
    return api;
  }

  const offersApi = makeContentApi("offers");
  const testimonialsApi = makeContentApi("testimonials");

  async function listVisibleOffers() {
    if (usePg) {
      const result = await pool.query(
        `SELECT * FROM offers
          WHERE is_active = TRUE
            AND (starts_at IS NULL OR starts_at <= NOW())
            AND (ends_at IS NULL OR ends_at >= NOW())
          ORDER BY sort_order ASC, created_at DESC`
      );
      return result.rows.map(normaliseRow);
    }
    const records = (await readJson("offers")).map(normaliseRow);
    return sortRecords(records.filter((offer) => isVisibleOffer(offer)));
  }

  async function listVisibleTestimonials() {
    if (usePg) {
      const result = await pool.query(
        "SELECT * FROM testimonials WHERE is_active = TRUE ORDER BY sort_order ASC, created_at DESC"
      );
      return result.rows.map(normaliseRow);
    }
    const records = (await readJson("testimonials")).map(normaliseRow);
    return sortRecords(records.filter((entry) => entry.is_active));
  }

  return {
    ensureTables,
    listAdmins,
    getAdminByEmail,
    getAdminById,
    createAdmin,
    setAdminActive,
    updateAdminPassword,
    touchAdminLogin,
    countActiveAdmins,
    listOffers: offersApi.listAll,
    getOffer: offersApi.getById,
    createOffer: offersApi.create,
    updateOffer: offersApi.update,
    deleteOffer: offersApi.remove,
    setOfferActive: offersApi.setActive,
    listVisibleOffers,
    listTestimonials: testimonialsApi.listAll,
    getTestimonial: testimonialsApi.getById,
    createTestimonial: testimonialsApi.create,
    updateTestimonial: testimonialsApi.update,
    deleteTestimonial: testimonialsApi.remove,
    setTestimonialActive: testimonialsApi.setActive,
    listVisibleTestimonials
  };
}

module.exports = { createStore };
