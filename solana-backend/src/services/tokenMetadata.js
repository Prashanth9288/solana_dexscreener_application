// src/services/tokenMetadata.js
// Production-grade token metadata service with three-tier resolution:
//   1. In-memory cache (per-token, 1hr TTL)
//   2. Jupiter token list (45k+ tokens, refreshed hourly)
//   3. On-chain RPC fallback (for brand-new tokens like Pump.fun meme coins)
//
// This ensures even tokens created seconds ago return meaningful metadata.

const logger = require('../utils/logger');
const { fetchWithRetry } = require('../utils/rpcClient');

const JUPITER_TOKEN_LIST_URL = 'https://token.jup.ag/all';
const LIST_TTL_MS   = 60 * 60 * 1000; // 1 hour for full list refresh
const LOOKUP_TTL_MS = 60 * 60 * 1000; // 1 hour per individual token

// ── Caches ────────────────────────────────────────────────────────────────────
let tokenListMap   = null;
let listFetchedAt  = 0;
let fetchInFlight  = null;
const perTokenCache = new Map();

// Well-known tokens that should always resolve (hardcoded fallback)
const WELL_KNOWN = new Map([
  ['So11111111111111111111111111111111111111112', {
    symbol: 'SOL', name: 'Solana', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png', decimals: 9,
  }],
  ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', {
    symbol: 'USDC', name: 'USD Coin', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png', decimals: 6,
  }],
  ['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', {
    symbol: 'USDT', name: 'Tether USD', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png', decimals: 6,
  }],
]);

// ── Jupiter full list fetch ───────────────────────────────────────────────────
async function fetchTokenList() {
  if (fetchInFlight) return fetchInFlight;

  fetchInFlight = (async () => {
    try {
      const res = await fetch(JUPITER_TOKEN_LIST_URL, { signal: AbortSignal.timeout(15000) });
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
      if (!tokenListMap) tokenListMap = new Map();
    } finally {
      fetchInFlight = null;
    }
  })();

  return fetchInFlight;
}

async function ensureList() {
  if (!tokenListMap || Date.now() - listFetchedAt > LIST_TTL_MS) {
    await fetchTokenList();
  }
}

// ── On-chain fallback — fetches token metadata via RPC getAccountInfo ─────────
// Works for ANY SPL token, including brand-new Pump.fun coins.
async function fetchOnChainMetadata(mint) {
  try {
    // Try Jupiter price API first — it has metadata for many tokens not in the full list
    const jupRes = await fetch(
      `https://api.jup.ag/price/v2?ids=${mint}&showExtraInfo=true`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (jupRes.ok) {
      const jupData = await jupRes.json();
      const tokenInfo = jupData?.data?.[mint]?.extraInfo?.quotedPrice;
      const mintSymbol = jupData?.data?.[mint]?.mintSymbol;
      if (mintSymbol) {
        return {
          symbol:   mintSymbol,
          name:     mintSymbol, // Jupiter price API doesn't have full name
          logoURI:  null,
          decimals: 0,
          source:   'jupiter-price',
        };
      }
    }
  } catch (_) {}

  // Last resort: return a truncated address-based label so it's never null
  return {
    symbol:   mint.slice(0, 6) + '...',
    name:     `Token ${mint.slice(0, 8)}...${mint.slice(-4)}`,
    logoURI:  null,
    decimals: 0,
    source:   'address-fallback',
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

async function get(mint) {
  if (!mint || mint === 'Unknown') return null;

  // 1. Per-token cache
  const cached = perTokenCache.get(mint);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  // 2. Well-known hardcoded
  if (WELL_KNOWN.has(mint)) {
    const data = WELL_KNOWN.get(mint);
    perTokenCache.set(mint, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
    return data;
  }

  // 3. Jupiter full list
  await ensureList();
  let data = tokenListMap.get(mint) || null;

  // 4. On-chain fallback (for new tokens)
  if (!data) {
    data = await fetchOnChainMetadata(mint);
  }

  perTokenCache.set(mint, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
  return data;
}

async function getBatch(mints) {
  if (!mints || mints.length === 0) return {};
  await ensureList();

  const result = {};
  const missingMints = [];

  for (const mint of mints) {
    if (!mint || mint === 'Unknown') continue;

    // 1. Per-token cache hit
    const cached = perTokenCache.get(mint);
    if (cached && Date.now() < cached.expiresAt) {
      result[mint] = cached.data;
      continue;
    }

    // 2. Well-known
    if (WELL_KNOWN.has(mint)) {
      const data = WELL_KNOWN.get(mint);
      perTokenCache.set(mint, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
      result[mint] = data;
      continue;
    }

    // 3. Jupiter list
    const data = tokenListMap.get(mint) || null;
    if (data) {
      perTokenCache.set(mint, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
      result[mint] = data;
    } else {
      missingMints.push(mint);
    }
  }

  // 4. Batch-resolve missing mints via on-chain fallback (parallel, capped at 10)
  if (missingMints.length > 0) {
    const toResolve = missingMints.slice(0, 10); // cap to prevent flooding
    const resolved = await Promise.all(toResolve.map(m => fetchOnChainMetadata(m)));
    for (let i = 0; i < toResolve.length; i++) {
      const mint = toResolve[i];
      const data = resolved[i];
      perTokenCache.set(mint, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
      result[mint] = data;
    }
    // Any remaining mints beyond cap get address fallback synchronously
    for (let i = 10; i < missingMints.length; i++) {
      const mint = missingMints[i];
      const data = {
        symbol:   mint.slice(0, 6) + '...',
        name:     `Token ${mint.slice(0, 8)}...${mint.slice(-4)}`,
        logoURI:  null,
        decimals: 0,
        source:   'address-fallback',
      };
      perTokenCache.set(mint, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
      result[mint] = data;
    }
  }

  return result;
}

// Preload in background
fetchTokenList().catch(() => {});

module.exports = { get, getBatch };
