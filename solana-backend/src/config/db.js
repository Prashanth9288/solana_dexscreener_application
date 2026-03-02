require("dotenv").config();
const { Pool } = require("pg");
const logger = require("../utils/logger");

// Render provides a single DATABASE_URL for managed Postgres.
// We prefer that, and fall back to individual vars for local dev.
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required for Render Postgres
    }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || "5432", 10),
    };

const pool = new Pool(poolConfig);

// Verify connectivity at startup — log clearly but do NOT crash the process.
// Routes that need the DB will fail individually; /health stays up.
pool.connect()
  .then(client => {
    logger.info("PostgreSQL connected successfully.");
    client.release();
  })
  .catch(err => {
    logger.error(`PostgreSQL connection error: ${err.message}`);
    logger.error(
      "Check DATABASE_URL (production) or DB_* env vars (local) in your environment."
    );
    // Do NOT call process.exit(1) here — let health check stay alive
    // so Render doesn't immediately kill the container.
  });

module.exports = pool;