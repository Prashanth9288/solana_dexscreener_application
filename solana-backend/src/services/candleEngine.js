// src/services/candleEngine.js — Real-time OHLCV Candle Generation
// ─────────────────────────────────────────────────────────────────────────────
// Maintains in-memory 1-minute candle buffers for all active pairs.
// - Updates candle OHLCV on each swap
// - Finalizes candles every 60s → writes to candles_1m table
// - Publishes candle_update events to Redis
// ─────────────────────────────────────────────────────────────────────────────

const pool = require('../config/db');
const logger = require('../utils/logger');
const { getPublisher } = require('../config/redisClient');

const { LRUCache } = require('lru-cache');

// In-memory candle buffers: pairKey → { bucket, open, high, low, close, volume, tradeCount }
const candleBuffers = new LRUCache({ max: 50_000, ttl: 1000 * 60 * 60 * 24 }); // 24h TTL

let finalizerTimer = null;

function pairKey(base, quote) {
  return `${base}:${quote}`;
}

/**
 * Get the current 1-minute bucket timestamp (floored to minute boundary)
 */
function currentBucket() {
  const now = Math.floor(Date.now() / 1000);
  return now - (now % 60);
}

/**
 * Process a decoded swap — update or create candle for the pair
 */
function onSwap(swap) {
  if (!swap || !swap.base_token || !swap.quote_token) return;
  if (swap.base_token === 'Unknown' || swap.quote_token === 'Unknown') return;

  const price = Number(swap.price_usd);
  if (!price || price <= 0 || !isFinite(price)) return;

  const volume = Number(swap.usd_value) || 0;
  const key = pairKey(swap.base_token, swap.quote_token);
  const bucket = currentBucket();

  const existing = candleBuffers.get(key);

  if (existing && existing.bucket === bucket) {
    // Update existing candle
    existing.high = Math.max(existing.high, price);
    existing.low = Math.min(existing.low, price);
    existing.close = price;
    existing.volume += volume;
    existing.tradeCount++;
  } else {
    // New candle (or new bucket)
    // If previous bucket exists, it will be finalized by the timer
    if (existing && existing.bucket !== bucket) {
      // Finalize the old candle immediately
      finalizeCandle(key, existing);
    }

    candleBuffers.set(key, {
      baseToken: swap.base_token,
      quoteToken: swap.quote_token,
      bucket,
      open: price,
      high: price,
      low: price,
      close: price,
      volume,
      tradeCount: 1,
    });
  }
}

/**
 * Finalize a single candle — write to DB and publish event
 */
async function finalizeCandle(key, candle) {
  if (!candle || candle.tradeCount === 0) return;

  try {
    await pool.query(
      `INSERT INTO candles_1m (base_token, quote_token, bucket_time, open, high, low, close, volume, trade_count)
       VALUES ($1, $2, to_timestamp($3), $4, $5, $6, $7, $8, $9)
       ON CONFLICT (base_token, quote_token, bucket_time)
       DO UPDATE SET
         high = GREATEST(candles_1m.high, EXCLUDED.high),
         low = LEAST(candles_1m.low, EXCLUDED.low),
         close = EXCLUDED.close,
         volume = candles_1m.volume + EXCLUDED.volume,
         trade_count = candles_1m.trade_count + EXCLUDED.trade_count`,
      [
        candle.baseToken, candle.quoteToken, candle.bucket,
        candle.open, candle.high, candle.low, candle.close,
        candle.volume, candle.tradeCount
      ]
    );
  } catch (err) {
    logger.warn(`[CandleEngine] DB write failed: ${err.message}`);
  }

  // Publish candle update to Redis
  const publisher = getPublisher();
  if (publisher && publisher.status === 'ready') {
    const payload = JSON.stringify({
      type: 'candle_update',
      data: {
        base_token: candle.baseToken,
        quote_token: candle.quoteToken,
        time: candle.bucket,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      }
    });
    publisher.publish(`trades:${candle.baseToken}`, payload).catch(() => {});
  }
}

/**
 * Finalize all stale candles (called every 60s by timer)
 */
async function finalizeStaleCandles() {
  const bucket = currentBucket();
  const toFinalize = [];

  for (const [key, candle] of candleBuffers.entries()) {
    if (candle.bucket < bucket) {
      toFinalize.push([key, candle]);
    }
  }

  if (toFinalize.length === 0) return;

  let finalized = 0;
  for (const [key, candle] of toFinalize) {
    await finalizeCandle(key, candle);
    candleBuffers.delete(key);
    finalized++;
  }

  if (finalized > 0) {
    logger.debug(`[CandleEngine] Finalized ${finalized} candles`);
  }
}

/**
 * Start the candle finalization timer
 */
function start() {
  // Finalize stale candles every 15 seconds (catches stragglers quickly)
  finalizerTimer = setInterval(finalizeStaleCandles, 15_000);
  if (finalizerTimer.unref) finalizerTimer.unref();
  logger.info('[CandleEngine] Started — finalizing candles every 15s');
}

/**
 * Stop the engine and flush all remaining candles
 */
async function stop() {
  if (finalizerTimer) {
    clearInterval(finalizerTimer);
    finalizerTimer = null;
  }

  // Flush all remaining candles
  for (const [key, candle] of candleBuffers.entries()) {
    await finalizeCandle(key, candle);
  }
  candleBuffers.clear();
  logger.info('[CandleEngine] Stopped and flushed all candles');
}

function getStats() {
  return {
    activeBuffers: candleBuffers.size,
  };
}

module.exports = {
  onSwap,
  start,
  stop,
  getStats,
};
