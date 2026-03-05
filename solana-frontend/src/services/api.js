/**
 * API Service — Production-grade fetch wrapper
 * - AbortController per request
 * - Retry with exponential backoff (3 attempts)
 * - Request deduplication via in-flight Map
 * - Error normalization
 */

import { API_BASE } from '../constants';

const inFlightRequests = new Map();
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
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const promise = fetchWithRetry(url, options)
    .finally(() => inFlightRequests.delete(key));

  inFlightRequests.set(key, promise);
  return promise;
}

// ── Public API ─────────────────────────────────────────────────────────────────

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
