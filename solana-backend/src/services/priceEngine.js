// src/services/priceEngine.js — Real-time Price Computation Service
// ─────────────────────────────────────────────────────────────────────────────
// Maintains in-memory price state for all active pairs.
// - Updates instantly on each decoded swap
// - Filters micro-swaps (<$0.50) to prevent manipulation
// - Publishes price_update events to Redis Pub/Sub
// ─────────────────────────────────────────────────────────────────────────────

const logger = require('../utils/logger');
const { getPublisher } = require('../config/redisClient');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const STABLE_COINS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);

const { LRUCache } = require('lru-cache');

// In-memory price state: pairKey → { priceUsd, priceNative, lastUpdated, volume5m }
const priceMap = new LRUCache({ max: 50_000, ttl: 1000 * 60 * 60 * 24 }); // 24h TTL

// Cached SOL price (updated externally)
let cachedSolPrice = null;

function pairKey(base, quote) {
  return `${base}:${quote}`;
}

/**
 * Update SOL price from external source (called by transactionRoutes)
 */
function setSolPrice(price) {
  if (price && price > 0 && isFinite(price)) {
    cachedSolPrice = price;
  }
}

function getSolPrice() {
  return cachedSolPrice;
}

/**
 * Process a decoded swap and update price state
 */
function onSwap(swap) {
  if (!swap || !swap.base_token || !swap.quote_token) return;
  if (swap.base_token === 'Unknown' || swap.quote_token === 'Unknown') return;

  // Filter micro-swaps to prevent price manipulation
  const usdValue = Number(swap.usd_value) || 0;
  if (usdValue < 0.50) return;

  const priceUsd = Number(swap.price_usd);
  const priceNative = Number(swap.price_native);
  if (!priceUsd || priceUsd <= 0 || !isFinite(priceUsd)) return;

  const key = pairKey(swap.base_token, swap.quote_token);
  const now = Date.now();

  const existing = priceMap.get(key);
  const prevPrice = existing?.priceUsd || null;

  priceMap.set(key, {
    baseToken: swap.base_token,
    quoteToken: swap.quote_token,
    priceUsd,
    priceNative: priceNative || null,
    prevPriceUsd: prevPrice,
    lastUpdated: now,
    lastDex: swap.dex,
    lastUsdValue: usdValue,
  });

  // Publish price update to Redis (non-blocking)
  publishPriceUpdate(swap, priceUsd, prevPrice);
}

/**
 * Publish price_update event to Redis Pub/Sub
 */
function publishPriceUpdate(swap, priceUsd, prevPrice) {
  const publisher = getPublisher();
  if (!publisher || publisher.status !== 'ready') return;

  const payload = JSON.stringify({
    type: 'price_update',
    data: {
      base_token: swap.base_token,
      quote_token: swap.quote_token,
      price_usd: priceUsd,
      prev_price_usd: prevPrice,
      dex: swap.dex,
      timestamp: swap.block_time,
    }
  });

  // Publish to both base and quote token channels
  publisher.publish(`trades:${swap.base_token}`, payload).catch(() => {});
  if (swap.quote_token !== SOL_MINT && !STABLE_COINS.has(swap.quote_token)) {
    publisher.publish(`trades:${swap.quote_token}`, payload).catch(() => {});
  }
}

/**
 * Get current price for a pair
 */
function getPrice(baseToken, quoteToken) {
  return priceMap.get(pairKey(baseToken, quoteToken)) || null;
}

/**
 * Get price for a token (tries both SOL and USDC pairs)
 */
function getTokenPrice(mint) {
  // Try SOL pair first
  let p = priceMap.get(pairKey(mint, SOL_MINT));
  if (p) return p;

  // Try USDC pair
  for (const stable of STABLE_COINS) {
    p = priceMap.get(pairKey(mint, stable));
    if (p) return p;
  }

  // Try any pair where this token is the base
  for (const value of priceMap.values()) {
    if (value.baseToken === mint) return value;
  }

  return null;
}

/**
 * Get all active prices (for pair aggregator)
 */
function getAllPrices() {
  return priceMap;
}

function getStats() {
  return {
    activePairs: priceMap.size,
    solPrice: cachedSolPrice,
  };
}

module.exports = {
  onSwap,
  getPrice,
  getTokenPrice,
  getAllPrices,
  setSolPrice,
  getSolPrice,
  getStats,
};
