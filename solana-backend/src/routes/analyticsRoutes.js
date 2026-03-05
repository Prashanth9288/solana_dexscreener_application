// src/routes/analyticsRoutes.js
// Production analytics REST API for the Solana DEX backend.
// All endpoints use simple TTL caching (10s) to reduce DB load.

const express = require('express');
const pool    = require('../config/db');
const tokenMetadata = require('../services/tokenMetadata');
const logger  = require('../utils/logger');

const router = express.Router();

// ── Memory-safe LRU Cache ─────────────────────────────────────────────────────
// Hard limit of 500 items guarantees the server will never run out of memory 
// even if millions of unique queries are requested (1000+ API requests per sec).
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({
  max: 500, // Maximum number of unique API responses to store at once
  ttl: 10_000, 
});

function getCache(key) {
  return cache.get(key) || null;
}
function setCache(key, data) {
  cache.set(key, data);
}

// ── Shared query helper ───────────────────────────────────────────────────────
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// ── GET /analytics/recent?limit=50&offset=0 ───────────────────────────────────
// Latest decoded swaps from the DB, most recent first.
router.get('/recent', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const cacheKey = `recent:${limit}:${offset}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const rows = await query(
      `SELECT signature, slot, block_time, wallet, dex, swap_side,
              base_token, base_amount, quote_token, quote_amount,
              price_usd, usd_value, hop_type, final_hop, created_at
       FROM swaps
       ORDER BY block_time DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Attach token metadata
    const mints = [...new Set(rows.flatMap(r => [r.base_token, r.quote_token]).filter(Boolean))];
    const meta  = await tokenMetadata.getBatch(mints);
    const enriched = rows.map(r => ({
      ...r,
      base_token_meta:  meta[r.base_token]  || null,
      quote_token_meta: meta[r.quote_token] || null,
    }));

    const result = { data: enriched, count: enriched.length, limit, offset };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/recent error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch recent swaps' });
  }
});

// ── GET /analytics/stats ──────────────────────────────────────────────────────
// Global platform stats: total txns, volume, unique wallets, top DEX.
router.get('/stats', async (req, res) => {
  try {
    const cached = getCache('stats');
    if (cached) return res.json(cached);

    const [row] = await query(`
      SELECT
        COUNT(*)                                               AS total_transactions,
        COUNT(DISTINCT wallet)                                 AS unique_wallets,
        COUNT(DISTINCT dex)                                    AS active_dexes,
        COALESCE(SUM(usd_value), 0)                           AS total_volume_usd,
        COALESCE(AVG(usd_value), 0)                           AS avg_trade_usd,
        COUNT(*) FILTER (WHERE swap_side = 'buy')             AS total_buys,
        COUNT(*) FILTER (WHERE swap_side = 'sell')            AS total_sells,
        COUNT(*) FILTER (WHERE block_time > NOW() - INTERVAL '24 hours') AS txns_24h,
        COALESCE(SUM(usd_value) FILTER (
          WHERE block_time > NOW() - INTERVAL '24 hours'), 0) AS volume_24h_usd
      FROM swaps
    `);

    const result = {
      total_transactions:  parseInt(row.total_transactions, 10),
      unique_wallets:      parseInt(row.unique_wallets, 10),
      active_dexes:        parseInt(row.active_dexes, 10),
      total_volume_usd:    parseFloat(row.total_volume_usd),
      avg_trade_usd:       parseFloat(parseFloat(row.avg_trade_usd).toFixed(2)),
      total_buys:          parseInt(row.total_buys, 10),
      total_sells:         parseInt(row.total_sells, 10),
      txns_24h:            parseInt(row.txns_24h, 10),
      volume_24h_usd:      parseFloat(row.volume_24h_usd),
    };

    setCache('stats', result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/stats error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── GET /analytics/pairs?limit=20 ────────────────────────────────────────────
// Top trading pairs by USD volume.
router.get('/pairs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const cacheKey = `pairs:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const rows = await query(
      `SELECT
         base_token, quote_token,
         MAX(dex)                    AS dex,
         COUNT(*)                    AS trade_count,
         COALESCE(SUM(usd_value), 0) AS total_volume_usd,
         COALESCE(AVG(price_usd), 0) AS avg_price_usd,
         MAX(block_time)             AS last_trade_at
       FROM swaps
       WHERE base_token IS NOT NULL AND quote_token IS NOT NULL
       GROUP BY base_token, quote_token
       ORDER BY total_volume_usd DESC
       LIMIT $1`,
      [limit]
    );

    // Enrich with token metadata
    const mints = [...new Set(rows.flatMap(r => [r.base_token, r.quote_token]).filter(Boolean))];
    const meta  = await tokenMetadata.getBatch(mints);
    const enriched = rows.map(r => ({
      ...r,
      dex:              r.dex,
      trade_count:      parseInt(r.trade_count, 10),
      total_volume_usd: parseFloat(r.total_volume_usd),
      avg_price_usd:    parseFloat(parseFloat(r.avg_price_usd).toFixed(8)),
      base_token_meta:  meta[r.base_token]  || null,
      quote_token_meta: meta[r.quote_token] || null,
    }));

    const result = { data: enriched, count: enriched.length };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/pairs error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch pairs' });
  }
});

// ── GET /analytics/dex?limit=20 ──────────────────────────────────────────────
// Volume and trade count broken down by DEX.
router.get('/dex', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
    const cacheKey = `dex:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const rows = await query(
      `SELECT
         dex,
         COUNT(*)                    AS trade_count,
         COUNT(DISTINCT wallet)      AS unique_traders,
         COALESCE(SUM(usd_value), 0) AS total_volume_usd,
         COUNT(DISTINCT base_token)  AS unique_pairs
       FROM swaps
       WHERE dex IS NOT NULL
       GROUP BY dex
       ORDER BY total_volume_usd DESC
       LIMIT $1`,
      [limit]
    );

    const enriched = rows.map(r => ({
      ...r,
      trade_count:      parseInt(r.trade_count, 10),
      unique_traders:   parseInt(r.unique_traders, 10),
      total_volume_usd: parseFloat(r.total_volume_usd),
      unique_pairs:     parseInt(r.unique_pairs, 10),
    }));

    const result = { data: enriched, count: enriched.length };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/dex error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch DEX stats' });
  }
});

// ── GET /analytics/wallet/:address?limit=50&offset=0 ─────────────────────────
// Trade history for a specific wallet.
router.get('/wallet/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const cacheKey = `wallet:${address}:${limit}:${offset}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const [stats] = await query(
      `SELECT
         COUNT(*)                    AS total_trades,
         COALESCE(SUM(usd_value), 0) AS total_volume_usd,
         COUNT(DISTINCT dex)         AS dexes_used,
         COUNT(DISTINCT base_token)  AS tokens_traded,
         MIN(block_time)             AS first_trade_at,
         MAX(block_time)             AS last_trade_at
       FROM swaps WHERE wallet = $1`,
      [address]
    );

    const trades = await query(
      `SELECT signature, slot, block_time, dex, swap_side,
              base_token, base_amount, quote_token, quote_amount,
              price_usd, usd_value, hop_type, final_hop
       FROM swaps
       WHERE wallet = $1
       ORDER BY block_time DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [address, limit, offset]
    );

    // Enrich with metadata
    const mints = [...new Set(trades.flatMap(r => [r.base_token, r.quote_token]).filter(Boolean))];
    const meta  = await tokenMetadata.getBatch(mints);
    const enrichedTrades = trades.map(r => ({
      ...r,
      base_token_meta:  meta[r.base_token]  || null,
      quote_token_meta: meta[r.quote_token] || null,
    }));

    const result = {
      wallet: address,
      stats: {
        total_trades:     parseInt(stats.total_trades, 10),
        total_volume_usd: parseFloat(stats.total_volume_usd),
        dexes_used:       parseInt(stats.dexes_used, 10),
        tokens_traded:    parseInt(stats.tokens_traded, 10),
        first_trade_at:   stats.first_trade_at,
        last_trade_at:    stats.last_trade_at,
      },
      trades: enrichedTrades,
      count:  enrichedTrades.length,
      limit,
      offset,
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/wallet error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch wallet history' });
  }
});

// ── GET /analytics/token/:mint ────────────────────────────────────────────────
// Token metadata from Jupiter.
router.get('/token/:mint', async (req, res) => {
  try {
    const { mint } = req.params;
    const meta = await tokenMetadata.get(mint);
    if (!meta) return res.status(404).json({ error: 'Token not found' });
    res.json({ mint, ...meta });
  } catch (err) {
    logger.error('GET /analytics/token error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch token metadata' });
  }
});

// ── GET /analytics/ohlcv ──────────────────────────────────────────────────────
// Server-side OHLCV aggregation for TradingView charts.
// Query: ?base_token=...&quote_token=...&timeframe=5m&limit=500
router.get('/ohlcv', async (req, res) => {
  try {
    const { base_token, quote_token, timeframe = '15m' } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 1500);

    if (!base_token || !quote_token) {
      return res.status(400).json({ error: 'base_token and quote_token are required' });
    }

    // Map string timeframes to Postgres interval intervals
    const intervalMap = {
      '1m':  "1 minute",
      '5m':  "5 minutes",
      '15m': "15 minutes",
      '30m': "30 minutes",
      '1h':  "1 hour",
      '4h':  "4 hours",
      '1d':  "1 day"
    };
    
    const intervalExpr = intervalMap[timeframe] || "15 minutes";

    const cacheKey = `ohlcv:${base_token}:${quote_token}:${timeframe}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    // Postgres date_bin() perfectly aligns time buckets for financial OHLCV aggregation
    const rows = await query(
      `WITH buckets AS (
         SELECT 
           date_bin('${intervalExpr}', block_time, '2000-01-01') AS bucket_time,
           price_usd,
           usd_value
         FROM swaps
         WHERE base_token = $1 AND quote_token = $2
      ),
      aggregated AS (
        SELECT 
           bucket_time,
           FIRST_VALUE(price_usd) OVER (PARTITION BY bucket_time ORDER BY bucket_time) as open,
           MAX(price_usd) OVER (PARTITION BY bucket_time) as high,
           MIN(price_usd) OVER (PARTITION BY bucket_time) as low,
           LAST_VALUE(price_usd) OVER (PARTITION BY bucket_time ORDER BY bucket_time RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as close,
           SUM(usd_value) OVER (PARTITION BY bucket_time) as volume
        FROM buckets
      )
      SELECT DISTINCT bucket_time AS time, open, high, low, close, volume 
      FROM aggregated
      ORDER BY time DESC
      LIMIT $3`,
      [base_token, quote_token, limit]
    );

    // Frontend TradingView expects ascending strictly ordered timeline (oldest to newest)
    const formatted = rows.reverse().map(r => ({
      time:   new Date(r.time).getTime() / 1000,
      open:   parseFloat(r.open),
      high:   parseFloat(r.high),
      low:    parseFloat(r.low),
      close:  parseFloat(r.close),
      value:  parseFloat(r.volume)
    }));

    const result = { data: formatted };
    setCache(cacheKey, result); // TTL is 10s by default from LRU definition
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/ohlcv error', { error: err.message });
    res.status(500).json({ error: 'Failed to aggregate OHLCV' });
  }
});

module.exports = router;
