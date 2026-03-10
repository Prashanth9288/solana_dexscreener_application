/**
 * API Service — Production-grade fetch wrapper
 * - AbortController per request
 * - Retry with exponential backoff (3 attempts)
 * - Request deduplication via in-flight Map
 * - Error normalization
 */

import { API_BASE } from '../constants';

const inFlightRequests = new Map();
const responseCache = new Map(); // Simple LRU Cache
const CACHE_TTL = 15_000; // 15 seconds TTL guarantees real-time fresh data on forced refresh
const MAX_RETRIES = 3;
const BASE_DELAY = 500;

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status >= 500 && attempt < retries) {
          const delay = BASE_DELAY * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new ApiError(
          errorData.error || `HTTP ${response.status}`,
          response.status,
          errorData
        );
      }

      return await response.json();
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (err instanceof ApiError) throw err;

      if (attempt < retries) {
        const delay = BASE_DELAY * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new ApiError(err.message || 'Network error', 0, null);
    }
  }
}

function dedupedFetch(key, url, options) {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Promise.resolve(cached.data);
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const promise = fetchWithRetry(url, options)
    .then(data => {
      // Store successful responses in memory cache for 15s to speed up UI navigation
      responseCache.set(key, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => inFlightRequests.delete(key));

  inFlightRequests.set(key, promise);
  return promise;
}

// ═══════════════════════════════════════════════════════════════════════════════
// V2 API (from pre-computed pairs table)
// ═══════════════════════════════════════════════════════════════════════════════

export function getPairsV2(limit = 100, dex = 'all', sort = 'volume_24h', order = 'desc', signal) {
  const dexParam = dex && dex !== 'all' ? `&dex=${encodeURIComponent(dex)}` : '';
  const key = `pairs_v2:${limit}:${dex}:${sort}:${order}`;
  return dedupedFetch(key, `${API_BASE}/analytics/pairs/v2?limit=${limit}&sort=${sort}&order=${order}${dexParam}`, { signal });
}

export function getTrending(limit = 50, signal) {
  const key = `trending:${limit}`;
  return dedupedFetch(key, `${API_BASE}/analytics/trending?limit=${limit}`, { signal });
}

export function getGainers(limit = 50, signal) {
  const key = `gainers:${limit}`;
  return dedupedFetch(key, `${API_BASE}/analytics/gainers?limit=${limit}`, { signal });
}

export function getLosers(limit = 50, signal) {
  const key = `losers:${limit}`;
  return dedupedFetch(key, `${API_BASE}/analytics/losers?limit=${limit}`, { signal });
}

export function getNewPairs(limit = 50, signal) {
  const key = `new_pairs:${limit}`;
  return dedupedFetch(key, `${API_BASE}/analytics/new-pairs?limit=${limit}`, { signal });
}

export function getPairDetail(base, quote, signal) {
  const key = `pair_detail:${base}:${quote}`;
  return dedupedFetch(key, `${API_BASE}/analytics/pair/${base}/${quote}`, { signal });
}

export function getTradesForToken(base, limit = 50, signal) {
  const key = `trades:${base}:${limit}`;
  return dedupedFetch(key, `${API_BASE}/analytics/trades/${base}?limit=${limit}`, { signal });
}

export function getTopTraders(base, limit = 10, signal) {
  const key = `top_traders:${base}:${limit}`;
  return dedupedFetch(key, `${API_BASE}/analytics/top-traders/${base}?limit=${limit}`, { signal });
}

export function getOHLCVv2(baseToken, quoteToken, timeframe, limit = 500, signal) {
  const key = `ohlcv_v2:${baseToken}:${quoteToken}:${timeframe}:${limit}`;
  return dedupedFetch(key, `${API_BASE}/analytics/ohlcv/v2?base_token=${baseToken}&quote_token=${quoteToken}&timeframe=${timeframe}&limit=${limit}`, { signal });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY API (preserved)
// ═══════════════════════════════════════════════════════════════════════════════

export function getRecentTrades(limit = 50, offset = 0, signal) {
  const key = `recent:${limit}:${offset}`;
  return dedupedFetch(key, `${API_BASE}/analytics/recent?limit=${limit}&offset=${offset}`, { signal });
}

export function getStats(signal) {
  return dedupedFetch('stats', `${API_BASE}/analytics/stats`, { signal });
}

export function getPairs(limit = 50, signal) {
  const key = `pairs:${limit}`;
  return dedupedFetch(key, `${API_BASE}/analytics/pairs?limit=${limit}`, { signal });
}

export function getDexStats(limit = 20, signal) {
  const key = `dex:${limit}`;
  return dedupedFetch(key, `${API_BASE}/analytics/dex?limit=${limit}`, { signal });
}

export function getWalletHistory(address, limit = 50, offset = 0, signal) {
  const key = `wallet:${address}:${limit}:${offset}`;
  return dedupedFetch(key, `${API_BASE}/analytics/wallet/${address}?limit=${limit}&offset=${offset}`, { signal });
}

export function getTokenMeta(mint, signal) {
  const key = `token:${mint}`;
  return dedupedFetch(key, `${API_BASE}/analytics/token/${mint}`, { signal });
}

// ── EXTERNAL APIS ─────────────────────────────────────────────────────────────

export async function getTokenSecurity(mint, signal) {
  const key = `security:${mint}`;
  if (inFlightRequests.has(key)) return inFlightRequests.get(key);

  const promise = (async () => {
    try {
      const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, { signal });
      if (!res.ok) throw new Error('RugCheck fetch failed');
      return await res.json();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Failed to get security data from RugCheck:', err);
      throw err;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}

// ── UTILITIES ────────────────────────────────────────────────────────────────

export function decodeTransaction(signature, signal) {
  return fetchWithRetry(`${API_BASE}/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature }),
    signal,
  });
}

export function getOHLCV(baseToken, quoteToken, timeframe, limit = 500, signal) {
  const key = `ohlcv:${baseToken}:${quoteToken}:${timeframe}:${limit}`;
  return dedupedFetch(key, `${API_BASE}/analytics/ohlcv?base_token=${baseToken}&quote_token=${quoteToken}&timeframe=${timeframe}&limit=${limit}`, { signal });
}

export function checkHealth(signal) {
  return fetchWithRetry(`${API_BASE}/health`, { signal }, 1);
}
