// src/config/initDb.js
// Runs once on startup — creates tables + indexes if they don't exist.
// Safe to re-run on every deploy (all statements use IF NOT EXISTS).

const pool = require('./db');
const logger = require('../utils/logger');

const CREATE_SWAPS_TABLE = `
  CREATE TABLE IF NOT EXISTS swaps (
    id                   BIGSERIAL PRIMARY KEY,
    signature            TEXT UNIQUE NOT NULL,
    slot                 BIGINT,
    block_time           TIMESTAMPTZ,
    wallet               TEXT,
    dex                  TEXT,
    program_id           TEXT,
    type                 TEXT DEFAULT 'swap',
    swap_side            TEXT,
    base_token           TEXT,
    base_token_decimals  INT,
    base_amount          NUMERIC,
    quote_token          TEXT,
    quote_token_decimals INT,
    quote_amount         NUMERIC,
    price_usd            NUMERIC,
    price_native         NUMERIC,
    usd_value            NUMERIC,
    fee_lamports         BIGINT,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    hop_type             TEXT,
    hop_count            INT,
    final_hop            TEXT
  );
`;

const CREATE_INDEXES = [
  // Fast wallet history lookups (sorted by time natively)
  `CREATE INDEX IF NOT EXISTS idx_swaps_wallet_time ON swaps(wallet, block_time DESC);`,
  
  // Fast trading pair lookups (the core DexScreener feature)
  `CREATE INDEX IF NOT EXISTS idx_swaps_pair_time ON swaps(base_token, quote_token, block_time DESC);`,
  
  // Fast DEX specific volume calculations
  `CREATE INDEX IF NOT EXISTS idx_swaps_dex_time ON swaps(dex, block_time DESC);`,
  
  // For the /recent feed
  `CREATE INDEX IF NOT EXISTS idx_swaps_block_time ON swaps(block_time DESC);`,
  
  // For largest trades finding
  `CREATE INDEX IF NOT EXISTS idx_swaps_usd_value ON swaps(usd_value DESC NULLS LAST);`,
];

async function initDb() {
  let client;
  try {
    client = await pool.connect();
  } catch (connErr) {
    logger.warn(`Cannot connect to database: ${connErr.message}`);
    logger.warn('DB schema initialization skipped — will retry on next startup.');
    return; // Don't crash, just skip initialization
  }

  try {
    await client.query('BEGIN');
    await client.query(CREATE_SWAPS_TABLE);
    for (const idx of CREATE_INDEXES) {
      await client.query(idx);
    }
    await client.query('COMMIT');
    logger.info('DB initialized — swaps table and indexes ready.');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore rollback errors */ }
    logger.error(`DB initialization failed: ${err.message}`);
  } finally {
    client.release();
  }
}

module.exports = initDb;
