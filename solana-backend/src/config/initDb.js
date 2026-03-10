// src/config/initDb.js
// Runs once on startup — creates tables + indexes if they don't exist.
// Safe to re-run on every deploy (all statements use IF NOT EXISTS).

const pool = require('./db');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

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

const CREATE_TOKENS_TABLE = `
  CREATE TABLE IF NOT EXISTS tokens (
    mint          TEXT PRIMARY KEY,
    symbol        TEXT,
    name          TEXT,
    logo_uri      TEXT,
    decimals      INT DEFAULT 0,
    source        TEXT DEFAULT 'unknown',
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  );
`;

const CREATE_PAIRS_TABLE = `
  CREATE TABLE IF NOT EXISTS pairs (
    id               BIGSERIAL PRIMARY KEY,
    base_token       TEXT NOT NULL,
    quote_token      TEXT NOT NULL,
    dex              TEXT,
    price_usd        NUMERIC,
    price_native     NUMERIC,
    volume_5m        NUMERIC DEFAULT 0,
    volume_1h        NUMERIC DEFAULT 0,
    volume_6h        NUMERIC DEFAULT 0,
    volume_24h       NUMERIC DEFAULT 0,
    txns_5m          INT DEFAULT 0,
    txns_1h          INT DEFAULT 0,
    txns_6h          INT DEFAULT 0,
    txns_24h         INT DEFAULT 0,
    buys_24h         INT DEFAULT 0,
    sells_24h        INT DEFAULT 0,
    makers_24h       INT DEFAULT 0,
    price_change_5m  NUMERIC,
    price_change_1h  NUMERIC,
    price_change_6h  NUMERIC,
    price_change_24h NUMERIC,
    liquidity_usd    NUMERIC,
    market_cap       NUMERIC,
    fdv              NUMERIC,
    first_trade_at   TIMESTAMPTZ,
    last_trade_at    TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (base_token, quote_token)
  );
`;

const CREATE_CANDLES_TABLE = `
  CREATE TABLE IF NOT EXISTS candles_1m (
    id           BIGSERIAL PRIMARY KEY,
    base_token   TEXT NOT NULL,
    quote_token  TEXT NOT NULL,
    bucket_time  TIMESTAMPTZ NOT NULL,
    open         NUMERIC NOT NULL,
    high         NUMERIC NOT NULL,
    low          NUMERIC NOT NULL,
    close        NUMERIC NOT NULL,
    volume       NUMERIC DEFAULT 0,
    trade_count  INT DEFAULT 0,
    UNIQUE (base_token, quote_token, bucket_time)
  );
`;

// ═══════════════════════════════════════════════════════════════════════════════
// INDEX DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const CREATE_INDEXES = [
  // ── Swaps indexes ──
  `CREATE INDEX IF NOT EXISTS idx_swaps_wallet_time ON swaps(wallet, block_time DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_swaps_pair_time ON swaps(base_token, quote_token, block_time DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_swaps_dex_time ON swaps(dex, block_time DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_swaps_block_time ON swaps(block_time DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_swaps_usd_value ON swaps(usd_value DESC NULLS LAST);`,
  `CREATE INDEX IF NOT EXISTS idx_swaps_base_token_time ON swaps(base_token, block_time DESC);`,

  // ── Pairs indexes ──
  `CREATE INDEX IF NOT EXISTS idx_pairs_volume_24h ON pairs(volume_24h DESC NULLS LAST);`,
  `CREATE INDEX IF NOT EXISTS idx_pairs_price_change_24h ON pairs(price_change_24h DESC NULLS LAST);`,
  `CREATE INDEX IF NOT EXISTS idx_pairs_last_trade ON pairs(last_trade_at DESC NULLS LAST);`,
  `CREATE INDEX IF NOT EXISTS idx_pairs_txns_24h ON pairs(txns_24h DESC NULLS LAST);`,
  `CREATE INDEX IF NOT EXISTS idx_pairs_base_token ON pairs(base_token);`,

  // ── Candles indexes ──
  `CREATE INDEX IF NOT EXISTS idx_candles_pair_time ON candles_1m(base_token, quote_token, bucket_time DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_candles_bucket ON candles_1m(bucket_time DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_candles_base_time ON candles_1m(base_token, bucket_time DESC);`,

  // ── Tokens indexes ──
  `CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);`,
  `CREATE INDEX IF NOT EXISTS idx_tokens_last_seen ON tokens(last_seen_at DESC);`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// INIT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function initDb() {
  let client;
  try {
    client = await pool.connect();
  } catch (connErr) {
    logger.warn(`Cannot connect to database: ${connErr.message}`);
    logger.warn('DB schema initialization skipped — will retry on next startup.');
    return;
  }

  try {
    await client.query('BEGIN');

    // Create tables
    await client.query(CREATE_SWAPS_TABLE);
    await client.query(CREATE_TOKENS_TABLE);
    await client.query(CREATE_PAIRS_TABLE);
    await client.query(CREATE_CANDLES_TABLE);

    // Attempt TimescaleDB hypertable conversion (graceful fallback to standard PG)
    // We wrap this inside a SAVEPOINT. If the cloud database (like Render DB)
    // does not allow creating extensions for free tiers, the entire transaction won't abort.
    try {
      await client.query('SAVEPOINT ts_setup');
      await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;');
      await client.query(`SELECT create_hypertable('candles_1m', 'bucket_time', if_not_exists => true, migrate_data => true);`);
      await client.query('RELEASE SAVEPOINT ts_setup');
      logger.info('TimescaleDB hypertable configured for candles_1m.');
    } catch (tsErr) {
      await client.query('ROLLBACK TO SAVEPOINT ts_setup');
      logger.info('TimescaleDB not available or hypertable setup skipped; using standard PostgreSQL indexes.');
    }

    // Create indexes
    for (const idx of CREATE_INDEXES) {
      await client.query(idx);
    }

    await client.query('COMMIT');
    logger.info('DB initialized — swaps, tokens, pairs, candles_1m tables and indexes ready.');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore rollback errors */ }
    logger.error(`DB initialization failed: ${err.message}`);
  } finally {
    client.release();
  }
}

module.exports = initDb;
