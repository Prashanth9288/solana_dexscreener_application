// src/routes/analyticsRoutes.js
// Production analytics REST API for the Solana DEX backend.
// All endpoints use simple TTL caching (10s) to reduce DB load.

const express = require('express');
const pool    = require('../config/db');
const tokenMetadata = require('../services/tokenMetadata');
const priceEngine   = require('../services/priceEngine');
const logger  = require('../utils/logger');

const router = express.Router();

// ── Memory-safe LRU Cache ─────────────────────────────────────────────────────
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({
  max: 500,
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

// ── Token metadata enrichment helper ──────────────────────────────────────────
async function enrichWithMeta(rows, fields = ['base_token', 'quote_token']) {
  const mints = [...new Set(rows.flatMap(r => fields.map(f => r[f]).filter(Boolean)))];
  if (mints.length === 0) return rows;
  const meta = await tokenMetadata.getBatch(mints);
  return rows.map(r => {
    const enriched = { ...r };
    for (const f of fields) {
      enriched[`${f}_meta`] = meta[r[f]] || null;
    }
    return enriched;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /analytics/recent?limit=50&offset=0 ───────────────────────────────────
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
       ORDER BY block_time DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const enriched = await enrichWithMeta(rows);
    const result = { data: enriched, count: enriched.length, limit, offset };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/recent error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch recent swaps' });
  }
});

// ── GET /analytics/stats ──────────────────────────────────────────────────────
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
      sol_price:           priceEngine.getSolPrice(),
    };

    setCache('stats', result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/stats error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// V2 PAIR ENDPOINTS (from pre-computed `pairs` table)
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /analytics/pairs/v2 ──────────────────────────────────────────────────
// Pre-computed pairs with all metrics. Supports dex filter and sort.
router.get('/pairs/v2', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const dex = req.query.dex || null;
    const sort = req.query.sort || 'volume_24h';
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

    // Whitelist allowed sort columns
    const ALLOWED_SORTS = new Set([
      'volume_24h', 'volume_1h', 'volume_5m', 'volume_6h',
      'txns_24h', 'txns_1h', 'txns_5m',
      'price_change_24h', 'price_change_1h', 'price_change_5m', 'price_change_6h',
      'makers_24h', 'last_trade_at', 'price_usd',
    ]);
    const sortCol = ALLOWED_SORTS.has(sort) ? sort : 'volume_24h';

    const cacheKey = `pairs_v2:${limit}:${dex || 'all'}:${sortCol}:${order}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    let whereClause = 'WHERE txns_24h > 0';
    const params = [];
    let paramIdx = 1;

    if (dex && dex !== 'all') {
      whereClause += ` AND LOWER(dex) = LOWER($${paramIdx++})`;
      params.push(dex);
    }

    params.push(limit);

    const rows = await query(
      `SELECT
         base_token, quote_token, dex,
         price_usd, price_native,
         volume_5m, volume_1h, volume_6h, volume_24h,
         txns_5m, txns_1h, txns_6h, txns_24h,
         buys_24h, sells_24h, makers_24h,
         price_change_5m, price_change_1h, price_change_6h, price_change_24h,
         liquidity_usd, market_cap, fdv,
         first_trade_at, last_trade_at, updated_at
       FROM pairs
       ${whereClause}
       ORDER BY ${sortCol} ${order} NULLS LAST
       LIMIT $${paramIdx}`,
      params
    );

    // Parse numerics + enrich with token metadata
    const parsed = rows.map(r => ({
      ...r,
      price_usd:         r.price_usd ? parseFloat(r.price_usd) : null,
      price_native:      r.price_native ? parseFloat(r.price_native) : null,
      volume_5m:         parseFloat(r.volume_5m || 0),
      volume_1h:         parseFloat(r.volume_1h || 0),
      volume_6h:         parseFloat(r.volume_6h || 0),
      volume_24h:        parseFloat(r.volume_24h || 0),
      txns_5m:           parseInt(r.txns_5m || 0, 10),
      txns_1h:           parseInt(r.txns_1h || 0, 10),
      txns_6h:           parseInt(r.txns_6h || 0, 10),
      txns_24h:          parseInt(r.txns_24h || 0, 10),
      buys_24h:          parseInt(r.buys_24h || 0, 10),
      sells_24h:         parseInt(r.sells_24h || 0, 10),
      makers_24h:        parseInt(r.makers_24h || 0, 10),
      price_change_5m:   r.price_change_5m ? parseFloat(parseFloat(r.price_change_5m).toFixed(2)) : null,
      price_change_1h:   r.price_change_1h ? parseFloat(parseFloat(r.price_change_1h).toFixed(2)) : null,
      price_change_6h:   r.price_change_6h ? parseFloat(parseFloat(r.price_change_6h).toFixed(2)) : null,
      price_change_24h:  r.price_change_24h ? parseFloat(parseFloat(r.price_change_24h).toFixed(2)) : null,
      liquidity_usd:     r.liquidity_usd ? parseFloat(r.liquidity_usd) : null,
      market_cap:        r.market_cap ? parseFloat(r.market_cap) : null,
      fdv:               r.fdv ? parseFloat(r.fdv) : null,
    }));

    const enriched = await enrichWithMeta(parsed);
    const result = { data: enriched, count: enriched.length };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/pairs/v2 error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch pairs' });
  }
});

// ── GET /analytics/trending ──────────────────────────────────────────────────
// Top pairs sorted by volume velocity (volume_1h relative to volume_24h)
router.get('/trending', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const cacheKey = `trending:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const rows = await query(
      `SELECT
         base_token, quote_token, dex,
         price_usd, price_native,
         volume_5m, volume_1h, volume_6h, volume_24h,
         txns_5m, txns_1h, txns_6h, txns_24h,
         buys_24h, sells_24h, makers_24h,
         price_change_5m, price_change_1h, price_change_6h, price_change_24h,
         last_trade_at
       FROM pairs
       WHERE txns_1h > 2 AND volume_1h > 10
       ORDER BY volume_1h DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    const parsed = rows.map(r => ({
      ...r,
      price_usd:         r.price_usd ? parseFloat(r.price_usd) : null,
      volume_5m:         parseFloat(r.volume_5m || 0),
      volume_1h:         parseFloat(r.volume_1h || 0),
      volume_6h:         parseFloat(r.volume_6h || 0),
      volume_24h:        parseFloat(r.volume_24h || 0),
      txns_5m:           parseInt(r.txns_5m || 0, 10),
      txns_1h:           parseInt(r.txns_1h || 0, 10),
      txns_6h:           parseInt(r.txns_6h || 0, 10),
      txns_24h:          parseInt(r.txns_24h || 0, 10),
      buys_24h:          parseInt(r.buys_24h || 0, 10),
      sells_24h:         parseInt(r.sells_24h || 0, 10),
      makers_24h:        parseInt(r.makers_24h || 0, 10),
      price_change_5m:   r.price_change_5m ? parseFloat(parseFloat(r.price_change_5m).toFixed(2)) : null,
      price_change_1h:   r.price_change_1h ? parseFloat(parseFloat(r.price_change_1h).toFixed(2)) : null,
      price_change_6h:   r.price_change_6h ? parseFloat(parseFloat(r.price_change_6h).toFixed(2)) : null,
      price_change_24h:  r.price_change_24h ? parseFloat(parseFloat(r.price_change_24h).toFixed(2)) : null,
    }));

    const enriched = await enrichWithMeta(parsed);
    const result = { data: enriched, count: enriched.length };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/trending error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch trending pairs' });
  }
});

// ── GET /analytics/gainers ───────────────────────────────────────────────────
router.get('/gainers', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const cacheKey = `gainers:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const rows = await query(
      `SELECT base_token, quote_token, dex, price_usd,
              volume_1h, volume_24h, txns_24h,
              price_change_5m, price_change_1h, price_change_6h, price_change_24h,
              last_trade_at
       FROM pairs
       WHERE price_change_24h IS NOT NULL AND txns_24h > 2
       ORDER BY price_change_24h DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    const parsed = rows.map(r => ({
      ...r,
      price_usd: r.price_usd ? parseFloat(r.price_usd) : null,
      volume_1h: parseFloat(r.volume_1h || 0),
      volume_24h: parseFloat(r.volume_24h || 0),
      txns_24h: parseInt(r.txns_24h || 0, 10),
      price_change_5m:  r.price_change_5m ? parseFloat(parseFloat(r.price_change_5m).toFixed(2)) : null,
      price_change_1h:  r.price_change_1h ? parseFloat(parseFloat(r.price_change_1h).toFixed(2)) : null,
      price_change_6h:  r.price_change_6h ? parseFloat(parseFloat(r.price_change_6h).toFixed(2)) : null,
      price_change_24h: r.price_change_24h ? parseFloat(parseFloat(r.price_change_24h).toFixed(2)) : null,
    }));

    const enriched = await enrichWithMeta(parsed);
    setCache(cacheKey, { data: enriched, count: enriched.length });
    res.json({ data: enriched, count: enriched.length });
  } catch (err) {
    logger.error('GET /analytics/gainers error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch gainers' });
  }
});

// ── GET /analytics/losers ────────────────────────────────────────────────────
router.get('/losers', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const cacheKey = `losers:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const rows = await query(
      `SELECT base_token, quote_token, dex, price_usd,
              volume_1h, volume_24h, txns_24h,
              price_change_5m, price_change_1h, price_change_6h, price_change_24h,
              last_trade_at
       FROM pairs
       WHERE price_change_24h IS NOT NULL AND txns_24h > 2
       ORDER BY price_change_24h ASC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    const parsed = rows.map(r => ({
      ...r,
      price_usd: r.price_usd ? parseFloat(r.price_usd) : null,
      volume_1h: parseFloat(r.volume_1h || 0),
      volume_24h: parseFloat(r.volume_24h || 0),
      txns_24h: parseInt(r.txns_24h || 0, 10),
      price_change_5m:  r.price_change_5m ? parseFloat(parseFloat(r.price_change_5m).toFixed(2)) : null,
      price_change_1h:  r.price_change_1h ? parseFloat(parseFloat(r.price_change_1h).toFixed(2)) : null,
      price_change_6h:  r.price_change_6h ? parseFloat(parseFloat(r.price_change_6h).toFixed(2)) : null,
      price_change_24h: r.price_change_24h ? parseFloat(parseFloat(r.price_change_24h).toFixed(2)) : null,
    }));

    const enriched = await enrichWithMeta(parsed);
    setCache(cacheKey, { data: enriched, count: enriched.length });
    res.json({ data: enriched, count: enriched.length });
  } catch (err) {
    logger.error('GET /analytics/losers error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch losers' });
  }
});

// ── GET /analytics/new-pairs ─────────────────────────────────────────────────
router.get('/new-pairs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const cacheKey = `new_pairs:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const rows = await query(
      `SELECT p.base_token, p.quote_token, p.dex, p.price_usd,
              p.volume_1h, p.volume_24h, p.txns_24h,
              p.price_change_5m, p.price_change_1h, p.price_change_24h,
              p.last_trade_at,
              p.first_trade_at
       FROM pairs p
       WHERE p.first_trade_at > NOW() - INTERVAL '24 hours'
         AND p.txns_24h > 1
       ORDER BY p.last_trade_at DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    const parsed = rows.map(r => ({
      ...r,
      price_usd: r.price_usd ? parseFloat(r.price_usd) : null,
      volume_1h: parseFloat(r.volume_1h || 0),
      volume_24h: parseFloat(r.volume_24h || 0),
      txns_24h: parseInt(r.txns_24h || 0, 10),
      price_change_5m:  r.price_change_5m ? parseFloat(parseFloat(r.price_change_5m).toFixed(2)) : null,
      price_change_1h:  r.price_change_1h ? parseFloat(parseFloat(r.price_change_1h).toFixed(2)) : null,
      price_change_24h: r.price_change_24h ? parseFloat(parseFloat(r.price_change_24h).toFixed(2)) : null,
    }));

    const enriched = await enrichWithMeta(parsed);
    setCache(cacheKey, { data: enriched, count: enriched.length });
    res.json({ data: enriched, count: enriched.length });
  } catch (err) {
    logger.error('GET /analytics/new-pairs error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch new pairs' });
  }
});

// ── GET /analytics/pair/:base/:quote ─────────────────────────────────────────
// Single pair detail with full metrics
router.get('/pair/:base/:quote', async (req, res) => {
  try {
    const { base, quote } = req.params;
    const cacheKey = `pair_detail:${base}:${quote}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const [row] = await query(
      `SELECT * FROM pairs WHERE base_token = $1 AND quote_token = $2`,
      [base, quote]
    );

    if (!row) {
      // Fallback: try to build from swaps
      const [fallback] = await query(
        `SELECT base_token, quote_token, MAX(dex) AS dex,
                (ARRAY_AGG(price_usd ORDER BY block_time DESC))[1] AS price_usd,
                COUNT(*) AS txns_24h,
                COALESCE(SUM(usd_value), 0) AS volume_24h,
                MAX(block_time) AS last_trade_at
         FROM swaps
         WHERE base_token = $1 AND quote_token = $2
           AND block_time > NOW() - INTERVAL '24 hours'
         GROUP BY base_token, quote_token`,
        [base, quote]
      );
      if (!fallback) return res.status(404).json({ error: 'Pair not found' });

      const meta = await tokenMetadata.getBatch([base, quote]);
      const result = {
        ...fallback,
        price_usd: fallback.price_usd ? parseFloat(fallback.price_usd) : null,
        volume_24h: parseFloat(fallback.volume_24h || 0),
        txns_24h: parseInt(fallback.txns_24h || 0, 10),
        base_token_meta: meta[base] || null,
        quote_token_meta: meta[quote] || null,
      };
      setCache(cacheKey, result);
      return res.json(result);
    }

    const meta = await tokenMetadata.getBatch([base, quote]);
    const result = {
      ...row,
      price_usd: row.price_usd ? parseFloat(row.price_usd) : null,
      price_native: row.price_native ? parseFloat(row.price_native) : null,
      volume_5m: parseFloat(row.volume_5m || 0),
      volume_1h: parseFloat(row.volume_1h || 0),
      volume_6h: parseFloat(row.volume_6h || 0),
      volume_24h: parseFloat(row.volume_24h || 0),
      txns_24h: parseInt(row.txns_24h || 0, 10),
      buys_24h: parseInt(row.buys_24h || 0, 10),
      sells_24h: parseInt(row.sells_24h || 0, 10),
      makers_24h: parseInt(row.makers_24h || 0, 10),
      price_change_5m:  row.price_change_5m ? parseFloat(parseFloat(row.price_change_5m).toFixed(2)) : null,
      price_change_1h:  row.price_change_1h ? parseFloat(parseFloat(row.price_change_1h).toFixed(2)) : null,
      price_change_6h:  row.price_change_6h ? parseFloat(parseFloat(row.price_change_6h).toFixed(2)) : null,
      price_change_24h: row.price_change_24h ? parseFloat(parseFloat(row.price_change_24h).toFixed(2)) : null,
      base_token_meta: meta[base] || null,
      quote_token_meta: meta[quote] || null,
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/pair/:base/:quote error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch pair detail' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// V2 OHLCV (from pre-computed candles_1m table)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/ohlcv/v2', async (req, res) => {
  try {
    const { base_token, quote_token, timeframe = '15m' } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 1500);

    if (!base_token || !quote_token) {
      return res.status(400).json({ error: 'base_token and quote_token are required' });
    }

    const intervalMap = {
      '1m':  '1 minute',
      '5m':  '5 minutes',
      '15m': '15 minutes',
      '30m': '30 minutes',
      '1h':  '1 hour',
      '4h':  '4 hours',
      '1d':  '1 day'
    };
    const intervalExpr = intervalMap[timeframe] || '15 minutes';

    const cacheKey = `ohlcv_v2:${base_token}:${quote_token}:${timeframe}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    let rows;

    if (timeframe === '1m') {
      // Direct read from candles_1m
      rows = await query(
        `SELECT bucket_time AS time, open, high, low, close, volume
         FROM candles_1m
         WHERE base_token = $1 AND quote_token = $2
         ORDER BY bucket_time DESC
         LIMIT $3`,
        [base_token, quote_token, limit]
      );
    } else {
      // Aggregate from candles_1m using date_bin
      rows = await query(
        `SELECT
           date_bin('${intervalExpr}', bucket_time, '2000-01-01') AS time,
           (ARRAY_AGG(open ORDER BY bucket_time ASC))[1] AS open,
           MAX(high) AS high,
           MIN(low) AS low,
           (ARRAY_AGG(close ORDER BY bucket_time DESC))[1] AS close,
           SUM(volume) AS volume
         FROM candles_1m
         WHERE base_token = $1 AND quote_token = $2
         GROUP BY date_bin('${intervalExpr}', bucket_time, '2000-01-01')
         ORDER BY time DESC
         LIMIT $3`,
        [base_token, quote_token, limit]
      );
    }

    // If candles_1m is empty, fallback to raw swaps aggregation
    if (rows.length === 0) {
      rows = await query(
        `WITH buckets AS (
           SELECT
             date_bin('${intervalExpr}', block_time, '2000-01-01') AS bucket_time,
             price_usd, usd_value
           FROM swaps
           WHERE base_token = $1 AND quote_token = $2
             AND price_usd IS NOT NULL AND price_usd > 0
        )
        SELECT
           bucket_time AS time,
           (ARRAY_AGG(price_usd ORDER BY bucket_time))[1] AS open,
           MAX(price_usd) AS high,
           MIN(price_usd) AS low,
           (ARRAY_AGG(price_usd ORDER BY bucket_time DESC))[1] AS close,
           COALESCE(SUM(usd_value), 0) AS volume
        FROM buckets
        GROUP BY bucket_time
        ORDER BY time DESC
        LIMIT $3`,
        [base_token, quote_token, limit]
      );
    }

    const formatted = rows.reverse().map(r => ({
      time:   Math.floor(new Date(r.time).getTime() / 1000),
      open:   parseFloat(r.open),
      high:   parseFloat(r.high),
      low:    parseFloat(r.low),
      close:  parseFloat(r.close),
      volume: parseFloat(r.volume || 0),
    }));

    const result = { data: formatted };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/ohlcv/v2 error', { error: err.message });
    res.status(500).json({ error: 'Failed to aggregate OHLCV' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY ENDPOINTS (preserved for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /analytics/pairs (legacy) ────────────────────────────────────────────
router.get('/pairs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const cacheKey = `pairs:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    // Try v2 pairs table first
    const v2Rows = await query(
      `SELECT base_token, quote_token, dex,
              txns_24h AS trade_count,
              volume_24h AS total_volume_usd,
              price_usd AS avg_price_usd,
              last_trade_at
       FROM pairs
       WHERE txns_24h > 0
       ORDER BY volume_24h DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    let rows = v2Rows;

    // Fallback to swaps aggregation if pairs table is empty
    if (rows.length === 0) {
      rows = await query(
        `SELECT
           base_token, quote_token,
           MAX(dex) AS dex,
           COUNT(*) AS trade_count,
           COALESCE(SUM(usd_value), 0) AS total_volume_usd,
           COALESCE(AVG(price_usd), 0) AS avg_price_usd,
           MAX(block_time) AS last_trade_at
         FROM swaps
         WHERE base_token IS NOT NULL AND quote_token IS NOT NULL
         GROUP BY base_token, quote_token
         ORDER BY total_volume_usd DESC
         LIMIT $1`,
        [limit]
      );
    }

    const enriched = await enrichWithMeta(rows.map(r => ({
      ...r,
      trade_count:      parseInt(r.trade_count || 0, 10),
      total_volume_usd: parseFloat(r.total_volume_usd || 0),
      avg_price_usd:    r.avg_price_usd ? parseFloat(parseFloat(r.avg_price_usd).toFixed(8)) : null,
    })));

    const result = { data: enriched, count: enriched.length };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/pairs error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch pairs' });
  }
});

// ── GET /analytics/dex ──────────────────────────────────────────────────────
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

    setCache(cacheKey, { data: enriched, count: enriched.length });
    res.json({ data: enriched, count: enriched.length });
  } catch (err) {
    logger.error('GET /analytics/dex error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch DEX stats' });
  }
});

// ── GET /analytics/wallet/:address ───────────────────────────────────────────
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
         COUNT(*) AS total_trades,
         COALESCE(SUM(usd_value), 0) AS total_volume_usd,
         COUNT(DISTINCT dex) AS dexes_used,
         COUNT(DISTINCT base_token) AS tokens_traded,
         MIN(block_time) AS first_trade_at,
         MAX(block_time) AS last_trade_at
       FROM swaps WHERE wallet = $1`,
      [address]
    );

    const trades = await query(
      `SELECT signature, slot, block_time, dex, swap_side,
              base_token, base_amount, quote_token, quote_amount,
              price_usd, usd_value, hop_type, final_hop
       FROM swaps
       WHERE wallet = $1
       ORDER BY block_time DESC
       LIMIT $2 OFFSET $3`,
      [address, limit, offset]
    );

    const enrichedTrades = await enrichWithMeta(trades);

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
      limit, offset,
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/wallet error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch wallet history' });
  }
});

// ── GET /analytics/token/:mint ───────────────────────────────────────────────
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

// ── GET /analytics/ohlcv (legacy — kept for backward compat) ─────────────────
router.get('/ohlcv', async (req, res) => {
  // Redirect to v2
  req.url = '/ohlcv/v2' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
  return router.handle(req, res);
});

// ── GET /analytics/trades/:base ──────────────────────────────────────────────
// Recent trades for a specific token (for pair page live feed)
router.get('/trades/:base', async (req, res) => {
  try {
    const { base } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const cacheKey = `trades:${base}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const rows = await query(
      `SELECT signature, block_time, wallet, dex, swap_side,
              base_token, base_amount, quote_token, quote_amount,
              price_usd, usd_value
       FROM swaps
       WHERE base_token = $1
       ORDER BY block_time DESC
       LIMIT $2`,
      [base, limit]
    );

    const enriched = await enrichWithMeta(rows);
    const result = { data: enriched, count: enriched.length };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/trades/:base error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// ── GET /analytics/top-traders/:base ───────────────────────────────────────
// Top traders by volume for a specific token
router.get('/top-traders/:base', async (req, res) => {
  try {
    const { base } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const cacheKey = `top_traders:${base}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const rows = await query(
      `SELECT wallet,
              COUNT(*) AS trades,
              COALESCE(SUM(usd_value), 0) AS volume,
              COUNT(*) FILTER (WHERE swap_side = 'buy') AS buys,
              COUNT(*) FILTER (WHERE swap_side = 'sell') AS sells
       FROM swaps
       WHERE base_token = $1
       GROUP BY wallet
       ORDER BY volume DESC
       LIMIT $2`,
      [base, limit]
    );

    const result = {
      base_token: base,
      leaders: rows.map(r => ({
        wallet: r.wallet,
        trades: parseInt(r.trades, 10),
        volume: parseFloat(r.volume),
        buys: parseInt(r.buys, 10),
        sells: parseInt(r.sells, 10)
      }))
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('GET /analytics/top-traders/:base error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch top traders' });
  }
});

module.exports = router;
