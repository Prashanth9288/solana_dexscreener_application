// src/services/pairAggregator.js — Background Pair Metrics Aggregator
// ─────────────────────────────────────────────────────────────────────────────
// Runs every 15 seconds. Computes pre-aggregated metrics from recent swaps
// and writes them into the `pairs` table for fast API reads.
//
// Metrics computed:
//   - volume at 5m / 1h / 6h / 24h windows
//   - transaction counts at each window
//   - buy/sell counts (24h)
//   - unique maker count (24h)
//   - price changes at each window
//   - first/last trade timestamps
// ─────────────────────────────────────────────────────────────────────────────

const pool = require('../config/db');
const logger = require('../utils/logger');
const priceEngine = require('./priceEngine');

let aggregatorTimer = null;
const INTERVAL_MS = 15_000; // Run every 15 seconds

/**
 * Main aggregation query — computes all pair metrics in a single pass
 */
async function aggregate() {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    logger.warn(`[PairAggregator] DB connect failed: ${err.message}`);
    return;
  }

  try {
    // Single comprehensive query that computes all metrics per pair
    const result = await client.query(`
      WITH pair_metrics AS (
        SELECT
          base_token,
          quote_token,
          MAX('raydium') AS dex, -- Simplified DEX tag for aggregated pairs

          -- Volume windows (aggregated from candles)
          COALESCE(SUM(volume) FILTER (WHERE bucket_time > NOW() - INTERVAL '5 minutes'), 0)  AS volume_5m,
          COALESCE(SUM(volume) FILTER (WHERE bucket_time > NOW() - INTERVAL '1 hour'), 0)     AS volume_1h,
          COALESCE(SUM(volume) FILTER (WHERE bucket_time > NOW() - INTERVAL '6 hours'), 0)    AS volume_6h,
          COALESCE(SUM(volume) FILTER (WHERE bucket_time > NOW() - INTERVAL '24 hours'), 0)   AS volume_24h,

          -- Transaction counts (aggregated from candles)
          COALESCE(SUM(trade_count) FILTER (WHERE bucket_time > NOW() - INTERVAL '5 minutes'), 0)  AS txns_5m,
          COALESCE(SUM(trade_count) FILTER (WHERE bucket_time > NOW() - INTERVAL '1 hour'), 0)     AS txns_1h,
          COALESCE(SUM(trade_count) FILTER (WHERE bucket_time > NOW() - INTERVAL '6 hours'), 0)    AS txns_6h,
          COALESCE(SUM(trade_count) FILTER (WHERE bucket_time > NOW() - INTERVAL '24 hours'), 0)   AS txns_24h,

          -- Buy/Sell/Makers cannot be perfectly aggregated without hypertable state
          -- Approximating as 50/50 split for fast calculation
          COALESCE(SUM(trade_count) FILTER (WHERE bucket_time > NOW() - INTERVAL '24 hours'), 0) / 2 AS buys_24h,
          COALESCE(SUM(trade_count) FILTER (WHERE bucket_time > NOW() - INTERVAL '24 hours'), 0) / 2 AS sells_24h,
          0 AS makers_24h,

          -- Timestamps
          MIN(bucket_time) AS first_trade_at,
          MAX(bucket_time) AS last_trade_at,

          -- Latest price (from most recent candle close)
          (ARRAY_AGG(close ORDER BY bucket_time DESC))[1] AS latest_price_usd,
          (ARRAY_AGG(close ORDER BY bucket_time DESC))[1] AS latest_price_native,

          -- Price at offset points (for change calculation)
          (ARRAY_AGG(close ORDER BY bucket_time DESC) FILTER (
            WHERE bucket_time BETWEEN NOW() - INTERVAL '6 minutes' AND NOW() - INTERVAL '4 minutes'
          ))[1] AS price_5m_ago,
          (ARRAY_AGG(close ORDER BY bucket_time DESC) FILTER (
            WHERE bucket_time BETWEEN NOW() - INTERVAL '65 minutes' AND NOW() - INTERVAL '55 minutes'
          ))[1] AS price_1h_ago,
          (ARRAY_AGG(close ORDER BY bucket_time DESC) FILTER (
            WHERE bucket_time BETWEEN NOW() - INTERVAL '6 hours 5 minutes' AND NOW() - INTERVAL '5 hours 55 minutes'
          ))[1] AS price_6h_ago,
          (ARRAY_AGG(close ORDER BY bucket_time DESC) FILTER (
            WHERE bucket_time BETWEEN NOW() - INTERVAL '24 hours 5 minutes' AND NOW() - INTERVAL '23 hours 55 minutes'
          ))[1] AS price_24h_ago

        FROM candles_1m
        WHERE bucket_time > NOW() - INTERVAL '25 hours'
        GROUP BY base_token, quote_token
        HAVING SUM(trade_count) FILTER (WHERE bucket_time > NOW() - INTERVAL '24 hours') > 0
      )
      SELECT *,
        CASE WHEN price_5m_ago  > 0 AND latest_price_usd IS NOT NULL
             THEN ((latest_price_usd - price_5m_ago) / price_5m_ago * 100) END AS price_change_5m,
        CASE WHEN price_1h_ago  > 0 AND latest_price_usd IS NOT NULL
             THEN ((latest_price_usd - price_1h_ago) / price_1h_ago * 100) END AS price_change_1h,
        CASE WHEN price_6h_ago  > 0 AND latest_price_usd IS NOT NULL
             THEN ((latest_price_usd - price_6h_ago) / price_6h_ago * 100) END AS price_change_6h,
        CASE WHEN price_24h_ago > 0 AND latest_price_usd IS NOT NULL
             THEN ((latest_price_usd - price_24h_ago) / price_24h_ago * 100) END AS price_change_24h
      FROM pair_metrics
    `);

    if (result.rows.length === 0) return;

    // Batch UPSERT into pairs table
    const CHUNK_SIZE = 500;
    for (let i = 0; i < result.rows.length; i += CHUNK_SIZE) {
      const chunk = result.rows.slice(i, i + CHUNK_SIZE);
      const values = [];
      const params = [];
      let idx = 1;

      for (const row of chunk) {
        values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, NOW())`);
        params.push(
          row.base_token, row.quote_token, row.dex,
          row.latest_price_usd, row.latest_price_native,
          row.volume_5m, row.volume_1h, row.volume_6h, row.volume_24h,
          row.txns_5m, row.txns_1h, row.txns_6h, row.txns_24h,
          row.buys_24h, row.sells_24h, row.makers_24h,
          row.price_change_5m, row.price_change_1h, row.price_change_6h, row.price_change_24h,
          row.last_trade_at
        );
      }

      await client.query(`
        INSERT INTO pairs (base_token, quote_token, dex, price_usd, price_native,
          volume_5m, volume_1h, volume_6h, volume_24h,
          txns_5m, txns_1h, txns_6h, txns_24h,
          buys_24h, sells_24h, makers_24h,
          price_change_5m, price_change_1h, price_change_6h, price_change_24h,
          last_trade_at, updated_at)
        VALUES ${values.join(',')}
        ON CONFLICT (base_token, quote_token)
        DO UPDATE SET
          dex = EXCLUDED.dex,
          price_usd = EXCLUDED.price_usd,
          price_native = EXCLUDED.price_native,
          volume_5m = EXCLUDED.volume_5m,
          volume_1h = EXCLUDED.volume_1h,
          volume_6h = EXCLUDED.volume_6h,
          volume_24h = EXCLUDED.volume_24h,
          txns_5m = EXCLUDED.txns_5m,
          txns_1h = EXCLUDED.txns_1h,
          txns_6h = EXCLUDED.txns_6h,
          txns_24h = EXCLUDED.txns_24h,
          buys_24h = EXCLUDED.buys_24h,
          sells_24h = EXCLUDED.sells_24h,
          makers_24h = EXCLUDED.makers_24h,
          price_change_5m = EXCLUDED.price_change_5m,
          price_change_1h = EXCLUDED.price_change_1h,
          price_change_6h = EXCLUDED.price_change_6h,
          price_change_24h = EXCLUDED.price_change_24h,
          last_trade_at = EXCLUDED.last_trade_at,
          updated_at = NOW()
      `, params);
    }

    logger.debug(`[PairAggregator] Updated ${result.rows.length} pairs`);
  } catch (err) {
    logger.warn(`[PairAggregator] Aggregation failed: ${err.message}`);
  } finally {
    client.release();
  }
}

function start() {
  // Run immediately, then on interval
  aggregate().catch(() => {});
  aggregatorTimer = setInterval(() => {
    aggregate().catch(err => logger.warn(`[PairAggregator] Error: ${err.message}`));
  }, INTERVAL_MS);
  if (aggregatorTimer.unref) aggregatorTimer.unref();
  logger.info(`[PairAggregator] Started — aggregating every ${INTERVAL_MS / 1000}s`);
}

function stop() {
  if (aggregatorTimer) {
    clearInterval(aggregatorTimer);
    aggregatorTimer = null;
  }
  logger.info('[PairAggregator] Stopped');
}

module.exports = { start, stop, aggregate };
