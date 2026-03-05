/**
 * candleAggregator.js — Production OHLC Candle Aggregator
 *
 * Converts an array of raw trade ticks into time-bucketed OHLC candles.
 * Supports: 1s, 5s, 15s, 1m, 5m, 15m, 30m, 1h, 4h, 1d
 *
 * Rules:
 *  - Each candle is keyed by floor(timestamp / intervalSeconds)
 *  - Volume accumulates per bucket
 *  - Active (last) candle is always returned for chart.update()
 */

/** Interval definitions in seconds */
export const INTERVALS = {
  '1s':  1,
  '5s':  5,
  '15s': 15,
  '1m':  60,
  '5m':  300,
  '15m': 900,
  '30m': 1800,
  '1h':  3600,
  '4h':  14400,
  '1d':  86400,
};

/**
 * Get the candle time bucket (Unix seconds) for a given trade timestamp.
 * @param {number} tsMs - Trade timestamp in milliseconds
 * @param {number} intervalSec - Candle interval in seconds
 */
export function getBucketTime(tsMs, intervalSec) {
  return Math.floor(tsMs / 1000 / intervalSec) * intervalSec;
}

/**
 * Parse price from a trade record.
 * Supports price_usd, price, or computed amount/base_amount fields.
 */
export function parseTrade(trade) {
  const price = parseFloat(trade.price_usd ?? trade.price ?? 0);
  const volume = parseFloat(trade.amount_usd ?? trade.usd_amount ?? trade.amount ?? 0);
  const ts = trade.block_time_ms ?? trade.block_time * 1000 ?? Date.now();
  const side = (trade.type ?? trade.side ?? '').toLowerCase(); // 'buy' | 'sell'
  return { price, volume, ts, side };
}

/**
 * Build a complete candle array from an array of raw trades.
 *
 * @param {Array} trades - Raw trade objects (newest first OR oldest first)
 * @param {string} timeframe - One of INTERVALS keys, e.g. '5m'
 * @returns {Array} Sorted array of OHLC candles (oldest first)
 */
export function buildCandles(trades, timeframe = '5m') {
  const intervalSec = INTERVALS[timeframe] ?? INTERVALS['5m'];
  const map = new Map(); // bucket_time -> candle

  // Process oldest-first for correct OHLC ordering
  const sorted = [...trades].sort((a, b) => {
    const tsA = a.block_time_ms ?? a.block_time * 1000 ?? 0;
    const tsB = b.block_time_ms ?? b.block_time * 1000 ?? 0;
    return tsA - tsB;
  });

  for (const trade of sorted) {
    const { price, volume, ts } = parseTrade(trade);
    if (!price || price <= 0) continue;

    const bucketTime = getBucketTime(ts, intervalSec);

    if (map.has(bucketTime)) {
      const candle = map.get(bucketTime);
      candle.high = Math.max(candle.high, price);
      candle.low  = Math.min(candle.low, price);
      candle.close = price;
      candle.volume += volume;
    } else {
      map.set(bucketTime, {
        time:   bucketTime,
        open:   price,
        high:   price,
        low:    price,
        close:  price,
        volume: volume,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/**
 * Merge a new trade tick into an existing candle array.
 * Returns `{ candles, updatedCandle }` where:
 *  - `candles` is the full updated candle array
 *  - `updatedCandle` is the last candle (for chart.update())
 *
 * @param {Array} existingCandles - Current candle array (sorted oldest-first)
 * @param {Object} trade - New incoming trade tick
 * @param {string} timeframe - Active chart timeframe
 */
export function mergeTrade(existingCandles, trade, timeframe = '5m') {
  const intervalSec = INTERVALS[timeframe] ?? INTERVALS['5m'];
  const { price, volume, ts } = parseTrade(trade);
  if (!price || price <= 0) return { candles: existingCandles, updatedCandle: null };

  const bucketTime = getBucketTime(ts, intervalSec);
  const candles = existingCandles.length > 0 ? [...existingCandles] : [];
  const last = candles.length > 0 ? candles[candles.length - 1] : null;

  if (last && last.time === bucketTime) {
    // Update existing candle in-place
    const updated = {
      ...last,
      high:   Math.max(last.high, price),
      low:    Math.min(last.low, price),
      close:  price,
      volume: (last.volume ?? 0) + volume,
    };
    candles[candles.length - 1] = updated;
    return { candles, updatedCandle: updated };
  } else {
    // New candle
    const newCandle = {
      time:   bucketTime,
      open:   last?.close ?? price,
      high:   price,
      low:    price,
      close:  price,
      volume: volume,
    };
    candles.push(newCandle);
    if (candles.length > 2000) candles.shift();
    return { candles, updatedCandle: newCandle };
  }
}

/**
 * Merge a batch of trades into an existing candle array.
 * Processes them sequentially to maintain correct OHLC state.
 */
export function mergeTradeBatch(existingCandles, trades, timeframe = '5m') {
  let candles = existingCandles;
  let lastUpdated = null;

  // Sort batch oldest-first before merging
  const sorted = [...trades].sort((a, b) => {
    const tsA = a.block_time_ms ?? a.block_time * 1000 ?? 0;
    const tsB = b.block_time_ms ?? b.block_time * 1000 ?? 0;
    return tsA - tsB;
  });

  for (const trade of sorted) {
    const result = mergeTrade(candles, trade, timeframe);
    candles = result.candles;
    if (result.updatedCandle) lastUpdated = result.updatedCandle;
  }

  return { candles, updatedCandle: lastUpdated };
}
