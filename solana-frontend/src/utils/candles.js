/**
 * OHLCV candle construction from trade arrays.
 * Extracted from PairPage for reusability.
 */

import { normalizeTimestamp } from './formatters';

const TIMEFRAME_SECONDS = {
  '1s': 1, '1m': 60, '5m': 300, '15m': 900,
  '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400,
};

/**
 * Build OHLCV candle array from a list of trades.
 * @param {Array} trades — raw trades from backend, newest first
 * @param {string} timeframe — key from TIMEFRAME_SECONDS
 * @returns {Array} candles sorted ascending by time
 */
export function buildCandlesFromTrades(trades, timeframe = '5m') {
  if (!trades || trades.length === 0) return [];

  const intervalSecs = TIMEFRAME_SECONDS[timeframe] || 300;

  const sorted = trades
    .filter(t => t.price_usd && Number(t.price_usd) > 0)
    .map(t => ({
      price: Number(t.price_usd),
      volume: Number(t.usd_value || 0),
      time: Math.floor(normalizeTimestamp(t.block_time) / 1000),
    }))
    .sort((a, b) => a.time - b.time);

  if (sorted.length === 0) return [];

  const candles = [];
  let current = null;

  for (const { price, volume, time } of sorted) {
    const candleTime = Math.floor(time / intervalSecs) * intervalSecs;

    if (!current || current.time !== candleTime) {
      if (current) candles.push(current);
      current = {
        time: candleTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume,
      };
    } else {
      current.high = Math.max(current.high, price);
      current.low = Math.min(current.low, price);
      current.close = price;
      current.volume += volume;
    }
  }

  if (current) candles.push(current);
  return candles;
}

/**
 * Find price at a given time offset for % change computation.
 * @param {Array} trades — newest first
 * @param {number} secondsAgo — how far back to look
 * @returns {number|null}
 */
export function findPriceAtOffset(trades, secondsAgo) {
  if (!trades || trades.length === 0) return null;
  const targetTime = Date.now() - (secondsAgo * 1000);

  let closest = null;
  let closestDiff = Infinity;

  for (const trade of trades) {
    const tradeTime = normalizeTimestamp(trade.block_time);
    const diff = Math.abs(tradeTime - targetTime);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = trade;
    }
  }

  // Only valid if within ±50% of the target window
  if (closest && closestDiff < secondsAgo * 500) {
    return Number(closest.price_usd) || null;
  }
  return null;
}

export { TIMEFRAME_SECONDS };
