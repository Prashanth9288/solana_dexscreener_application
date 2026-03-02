// src/services/tokenMetadata.js
// In-memory cached Jupiter token metadata lookup.
// Jupiter token list is free, no API key required.
// Cache TTL: 1 hour per token. Full list is fetched once and stored in memory.

const logger = require('../utils/logger');

const JUPITER_TOKEN_LIST_URL = 'https://token.jup.ag/all';
const LIST_TTL_MS   = 60 * 60 * 1000; // 1 hour — refresh full list
const LOOKUP_TTL_MS = 60 * 60 * 1000; // 1 hour per individual token cache entry

// Full token list cache
let tokenListMap   = null; // Map<mint, metadata>
let listFetchedAt  = 0;
let fetchInFlight  = null; // Promise — prevents stampede

// Per-token cache (for tokens looked up individually)
const perTokenCache = new Map(); // mint → { data, expiresAt }

// ── Fetch full Jupiter token list ─────────────────────────────────────────────
async function fetchTokenList() {
  if (fetchInFlight) return fetchInFlight; // Deduplicate concurrent calls

  fetchInFlight = (async () => {
    try {
      const res = await fetch(JUPITER_TOKEN_LIST_URL, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`Jupiter API returned ${res.status}`);
      const tokens = await res.json();
      const map = new Map();
      for (const t of tokens) {
        if (t.address) {
          map.set(t.address, {
            symbol:   t.symbol   || 'UNKNOWN',
            name:     t.name     || 'Unknown Token',
            logoURI:  t.logoURI  || null,
            decimals: t.decimals ?? 0,
          });
        }
      }
      tokenListMap  = map;
      listFetchedAt = Date.now();
      logger.info(`Token metadata list loaded: ${map.size} tokens from Jupiter.`);
    } catch (err) {
      logger.warn(`Failed to fetch Jupiter token list: ${err.message}`);
      if (!tokenListMap) tokenListMap = new Map(); // Empty map — don't retry in a crash loop
    } finally {
      fetchInFlight = null;
    }
  })();

  return fetchInFlight;
}

// ── Ensure list is loaded and fresh ──────────────────────────────────────────
async function ensureList() {
  const stale = Date.now() - listFetchedAt > LIST_TTL_MS;
  if (!tokenListMap || stale) {
    await fetchTokenList();
  }
}

// ── Get single token metadata ─────────────────────────────────────────────────
async function get(mint) {
  if (!mint) return null;

  // Check per-token cache first
  const cached = perTokenCache.get(mint);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  await ensureList();
  const data = tokenListMap.get(mint) || null;

  // Store in per-token cache
  perTokenCache.set(mint, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
  return data;
}

// ── Get metadata for multiple mints in one shot ───────────────────────────────
async function getBatch(mints) {
  if (!mints || mints.length === 0) return {};
  await ensureList();

  const result = {};
  for (const mint of mints) {
    if (!mint) continue;
    const cached = perTokenCache.get(mint);
    if (cached && Date.now() < cached.expiresAt) {
      result[mint] = cached.data;
    } else {
      const data = tokenListMap.get(mint) || null;
      perTokenCache.set(mint, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
      result[mint] = data;
    }
  }
  return result;
}

// Preload in background on module load (non-blocking)
fetchTokenList().catch(() => {});

module.exports = { get, getBatch };
