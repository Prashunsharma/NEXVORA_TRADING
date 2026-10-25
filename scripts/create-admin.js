// Create an admin account for the Nexvora admin panel.
//
// Usage:
//   npm run create-admin            — interactive prompts
//   CREATE_ADMIN_NAME="..." CREATE_ADMIN_EMAIL="..." CREATE_ADMIN_PASSWORD="..." \
//     npm run create-admin          — non-interactive (used by automation/tests)
//
// Works with both storage modes: PostgreSQL when DATABASE_URL is set
// (the admins table is created if needed), otherwise the local JSON
// development store under data/.
require("dotenv").config();

const readline = require("readline");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const { createStore } = require("../lib/store");

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function collectDetails() {
  const fromEnv = {
    name: (process.env.CREATE_ADMIN_NAME || "").trim(),
    email: (process.env.CREATE_ADMIN_EMAIL || "").trim(),
    password: process.env.CREATE_ADMIN_PASSWORD || ""
  };
  if (fromEnv.name && fromEnv.email && fromEnv.password) return fromEnv;

  console.log("Create a Nexvora admin account");
  const name = await prompt("Full name: ");
  const email = await prompt("Email address: ");
  const password = await prompt("Password (min 10 characters): ");
  const confirm = await prompt("Confirm password: ");
  if (password !== confirm) {
    console.error("Error: the passwords do not match.");
    process.exit(1);
  }
  return { name, email, password };
}

async function main() {
  const { name, email, password } = await collectDetails();
  const cleanEmail = email.toLowerCase();

  if (name.length < 2) {
    console.error("Error: please enter a name (at least 2 characters).");
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    console.error("Error: please enter a valid email address.");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Error: the password must be at least 10 characters long.");
    process.exit(1);
  }

  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
  const store = createStore(pool);
  try {
    await store.ensureTables();
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await store.createAdmin({ name, email: cleanEmail, passwordHash });
    console.log(`Admin account created for ${admin.email} (id ${admin.id}).`);
    console.log(pool ? "Stored in PostgreSQL." : "Stored in the local development store (data/admins.json).");
    console.log("You can now sign in at /admin/login.");
  } catch (error) {
    if (error.code === "DUPLICATE_EMAIL") {
      console.error(`Error: an admin with the email ${cleanEmail} already exists.`);
    } else {
      console.error(`Error: could not create the admin account: ${error.message}`);
    }
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
