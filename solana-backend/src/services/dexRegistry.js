// src/services/dexRegistry.js — v13 Production-Grade Protocol Classification Engine
// ─────────────────────────────────────────────────────────────────────────────
// Backward compatible: AGGREGATORS[pid] still returns truthy string.
// Backward compatible: LIQUIDITY_PROGRAMS[pid] still returns { dex, source }.
// Added: structured metadata, accessor functions, unknown program learning buffer.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════════
// 1️⃣  STRUCTURED AGGREGATOR REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════
// Backward compat: value is still a string (aggregator name) so
// AGGREGATORS[pid] remains truthy and returns the name.
// Metadata is stored separately in AGGREGATOR_META for rich analytics.

const AGGREGATORS = {
  // Jupiter
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter V6",
  "JUP5cHjnnCx2DppVsufsLrWH8UzSmbiaiv2eFzVAMQJ": "Jupiter V5",
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": "Jupiter V4",
  "JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1sS3nF": "Jupiter V3",
  "JUP2jxvXaqu7NQY1GmWEBidKvFqwYW2H2gEbLcwKMA5": "Jupiter V2",
  "jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu": "Jupiter Limit",
  "RVKd61ztZW9rEtXc1z7fXAFz2uVH54camzato3tr1cG": "Jupiter Limit Order V2",

  // Raydium
  "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS": "Raydium Router",

  // PumpSwap
  "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH": "PumpSwap Router",

  // Prism
  "PRSMNsEPqh5TpcqYhE3G8U4BhcSMyrX9pP9q1f5g3D8": "Prism",

  // DFlow
  "DFL1zNkaGPWm1BqAVqRjCZvHmwTFrEaJtbzJWUo1wSj": "DFlow",
  "DFLowMQXN4W5z72zM5AZFqBfS9R1pWqU2j1QzWv6A5t": "DFlow V4",

  // Meteora Router
  "LBUZKhRxPF3XUpBCjp4kVn14nzKUKb4JeB3S1pStb4w": "Meteora DB (Router)",

  // 1inch
  "1iNchozjAM24K4TEnQzG5F5FDEYt258v7BpeM44T8g4": "1inch",

  // Kyber
  "kyberSWaPkE6fQZfKsD6v5oDqgAEMqWJd6wFkZbUvN": "KyberSwap",
};

// Rich metadata layer for analytics (keyed by same programId)
const AGGREGATOR_META = {
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": { name: "Jupiter", category: "aggregator", version: "v6", ecosystem: "Jupiter",  executionType: "routed", isActive: true },
  "JUP5cHjnnCx2DppVsufsLrWH8UzSmbiaiv2eFzVAMQJ": { name: "Jupiter", category: "aggregator", version: "v5", ecosystem: "Jupiter",  executionType: "routed", isActive: false },
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": { name: "Jupiter", category: "aggregator", version: "v4", ecosystem: "Jupiter",  executionType: "routed", isActive: false },
  "JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1sS3nF": { name: "Jupiter", category: "aggregator", version: "v3", ecosystem: "Jupiter",  executionType: "routed", isActive: false },
  "JUP2jxvXaqu7NQY1GmWEBidKvFqwYW2H2gEbLcwKMA5": { name: "Jupiter", category: "aggregator", version: "v2", ecosystem: "Jupiter",  executionType: "routed", isActive: false },
  "jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu": { name: "Jupiter", category: "aggregator", version: "limit", ecosystem: "Jupiter", executionType: "routed", isActive: true },
  "RVKd61ztZW9rEtXc1z7fXAFz2uVH54camzato3tr1cG": { name: "Jupiter", category: "aggregator", version: "limit-v2", ecosystem: "Jupiter", executionType: "routed", isActive: true },
  "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS":  { name: "Raydium Router", category: "aggregator", version: "v1", ecosystem: "Raydium", executionType: "routed", isActive: true },
  "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH": { name: "PumpSwap Router", category: "aggregator", version: "v1", ecosystem: "Pump", executionType: "routed", isActive: true },
  "PRSMNsEPqh5TpcqYhE3G8U4BhcSMyrX9pP9q1f5g3D8": { name: "Prism", category: "aggregator", version: "v1", ecosystem: "Prism", executionType: "routed", isActive: true },
  "DFL1zNkaGPWm1BqAVqRjCZvHmwTFrEaJtbzJWUo1wSj":  { name: "DFlow", category: "aggregator", version: "v1", ecosystem: "DFlow", executionType: "routed", isActive: true },
  "DFLowMQXN4W5z72zM5AZFqBfS9R1pWqU2j1QzWv6A5t": { name: "DFlow", category: "aggregator", version: "v4", ecosystem: "DFlow", executionType: "routed", isActive: true },
  "LBUZKhRxPF3XUpBCjp4kVn14nzKUKb4JeB3S1pStb4w": { name: "Meteora DB", category: "aggregator", version: "router", ecosystem: "Meteora", executionType: "routed", isActive: true },
  "1iNchozjAM24K4TEnQzG5F5FDEYt258v7BpeM44T8g4": { name: "1inch", category: "aggregator", version: "v1", ecosystem: "1inch", executionType: "routed", isActive: true },
  "kyberSWaPkE6fQZfKsD6v5oDqgAEMqWJd6wFkZbUvN":   { name: "KyberSwap", category: "aggregator", version: "v1", ecosystem: "Kyber", executionType: "routed", isActive: true },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2️⃣  STRUCTURED LIQUIDITY PROGRAM REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════
// Backward compat: value is { dex, source } so LIQUIDITY_PROGRAMS[pid].dex works.
// Extra fields added inline for rich classification.

const LIQUIDITY_PROGRAMS = {
  // ── Raydium ──
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { dex: "Raydium", source: "AMM_V4",   category: "liquidity", invariant: "AMM",   ecosystem: "Raydium",  version: "v4",     riskLevel: "low", isActive: true },
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK":  { dex: "Raydium", source: "CLMM",     category: "liquidity", invariant: "CLMM",  ecosystem: "Raydium",  version: "CLMM",   riskLevel: "low", isActive: true },
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C":  { dex: "Raydium", source: "CPMM",     category: "liquidity", invariant: "CPMM",  ecosystem: "Raydium",  version: "CPMM",   riskLevel: "low", isActive: true },
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1":  { dex: "Raydium", source: "AMM_V4",   category: "liquidity", invariant: "AMM",   ecosystem: "Raydium",  version: "v4-alt", riskLevel: "low", isActive: true },
  "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS":   { dex: "Raydium", source: "Router",   category: "liquidity", invariant: "AMM",   ecosystem: "Raydium",  version: "router", riskLevel: "low", isActive: true },
  "RVKd61ztZW9rEtXc1z7fXAFz2uVH54camzato3tr1cG":   { dex: "Raydium", source: "AMM_V4",   category: "liquidity", invariant: "AMM",   ecosystem: "Raydium",  version: "v4-new", riskLevel: "low", isActive: true },

  // ── Orca ──
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc":   { dex: "Orca", source: "Whirlpool",     category: "liquidity", invariant: "CLMM", ecosystem: "Orca", version: "whirlpool",  riskLevel: "low", isActive: true },
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP":  { dex: "Orca", source: "TokenSwap V2",  category: "liquidity", invariant: "AMM",  ecosystem: "Orca", version: "tokenswap",  riskLevel: "low", isActive: true },

  // ── Meteora ──
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB":  { dex: "Meteora", source: "Dynamic AMM", category: "liquidity", invariant: "AMM",  ecosystem: "Meteora", version: "dynamic",  riskLevel: "low", isActive: true },
  "LBUZKhRxPF3XUpBCjp4kVn14nzKUKb4JeB3S1pStb4w":   { dex: "Meteora", source: "DLMM",        category: "liquidity", invariant: "CLMM", ecosystem: "Meteora", version: "dlmm",     riskLevel: "low", isActive: true },

  // ── Pump.fun ──
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA":    { dex: "Pump.fun", source: "BondingCurve",          category: "liquidity", invariant: "bonding-curve", ecosystem: "Pump", version: "v1",       riskLevel: "high", isActive: true },
  "6EF8rrecthR5Dkzon8Nwu78hRvfMAt9Gj1nK1u8YxKk2":   { dex: "Pump.fun", source: "BondingCurve",          category: "liquidity", invariant: "bonding-curve", ecosystem: "Pump", version: "v1-alt",   riskLevel: "high", isActive: true },
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P":    { dex: "Pump.fun", source: "BondingCurve Standard", category: "liquidity", invariant: "bonding-curve", ecosystem: "Pump", version: "standard", riskLevel: "high", isActive: true },

  // ── Moonshot ──
  "MoonCVVNZFSYkqNXP6bxHLb6ihrEMZQn7GH4u5nMWjA":   { dex: "Moonshot", source: "Contract", category: "liquidity", invariant: "bonding-curve", ecosystem: "Moonshot", version: "v1", riskLevel: "high", isActive: true },

  // ── PumpSwap ──
  "PSwapMd2kKx8gT2Q3UvB4w5eJ9h5wP3H7V3b2gqzF1b":  { dex: "PumpSwap", source: "AMM",    category: "liquidity", invariant: "AMM",           ecosystem: "Pump",    version: "amm", riskLevel: "medium", isActive: true },
  "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH":   { dex: "PumpSwap", source: "Router", category: "liquidity", invariant: "AMM",           ecosystem: "Pump",    version: "router", riskLevel: "medium", isActive: true },

  // ── Phoenix ──
  "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY":    { dex: "Phoenix", source: "OrderBook", category: "liquidity", invariant: "CLOB", ecosystem: "Phoenix",  version: "v1", riskLevel: "low", isActive: true },

  // ── OpenBook (Serum successor) ──
  "openbookdex11111111111111111111111111111111":       { dex: "OpenBook", source: "OrderBook", category: "liquidity", invariant: "CLOB", ecosystem: "OpenBook", version: "v1", riskLevel: "low", isActive: true },

  // ── Jupiter (self-executing) ──
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4":   { dex: "Jupiter", source: "Aggregator V6", category: "liquidity", invariant: "AMM", ecosystem: "Jupiter", version: "v6",    riskLevel: "low", isActive: true },
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB":   { dex: "Jupiter", source: "Aggregator V4", category: "liquidity", invariant: "AMM", ecosystem: "Jupiter", version: "v4",    riskLevel: "low", isActive: false },
  "jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu":   { dex: "Jupiter", source: "Limit Order",   category: "liquidity", invariant: "AMM", ecosystem: "Jupiter", version: "limit", riskLevel: "low", isActive: true },

  // ── FluxBeam ──
  "FLUXubRmkEi2q6K3Y9kBPg924BgnTgDkEBSzG5R8V2y":   { dex: "FluxBeam", source: "Swap", category: "liquidity", invariant: "AMM", ecosystem: "FluxBeam", version: "v1", riskLevel: "medium", isActive: true },

  // ── Lifinity ──
  "EewxydAPCCVuNEyrVN68PuSYdQ7wKn27V5Gjeoi8dy3S":   { dex: "Lifinity", source: "V2", category: "liquidity", invariant: "CLMM", ecosystem: "Lifinity", version: "v2", riskLevel: "low", isActive: true },

  // ── Saber (Stable AMM) ──
  "SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ":    { dex: "Saber", source: "StableSwap", category: "liquidity", invariant: "stable-AMM", ecosystem: "Saber", version: "v1", riskLevel: "low", isActive: true },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3️⃣  UNKNOWN PROGRAM LEARNING BUFFER (in-memory frequency tracker)
// ═══════════════════════════════════════════════════════════════════════════════

const unknownProgramBuffer = new Map();

const SOLANA_SYSTEM_PROGRAMS = new Set([
  "11111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "SysvarRent111111111111111111111111111111111",
  "SysvarC1ock11111111111111111111111111111111",
  "Vote111111111111111111111111111111111111111",
  "Stake11111111111111111111111111111111111111",
]);

// Log file for persistence across restarts
const LOG_FILE = path.join(__dirname, '../../logs/unknown_programs.log');
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Phase 9 constants
const MAX_BUFFER_SIZE = 10000;

function processUnknownPrograms(activePrograms) {
  if (!activePrograms || activePrograms.length === 0) return;

  const now = Date.now();
  const toLog = [];

  for (const pid of activePrograms) {
    // Phase 9: Skip system programs early (no filter() allocation)
    if (SOLANA_SYSTEM_PROGRAMS.has(pid)) continue;
    if (LIQUIDITY_PROGRAMS[pid]) continue;
    if (AGGREGATORS[pid]) continue;

    toLog.push(pid);
    const existing = unknownProgramBuffer.get(pid);

    if (!existing) {
      // Phase 9: LRU eviction — evict oldest entry when buffer full
      if (unknownProgramBuffer.size >= MAX_BUFFER_SIZE) {
        const oldestKey = unknownProgramBuffer.keys().next().value;
        unknownProgramBuffer.delete(oldestKey);
      }
      unknownProgramBuffer.set(pid, { count: 1, firstSeen: now, lastSeen: now });
    } else {
      existing.count++;
      existing.lastSeen = now;

      // Escalation thresholds
      if (existing.count === 100) {
        logger.warn("Unknown program seen 100 times — potential new DEX", {
          programId: pid, firstSeen: new Date(existing.firstSeen).toISOString()
        });
      }
      if (existing.count === 1000) {
        logger.warn("Unknown program seen 1000 times — high-confidence liquidity candidate", {
          programId: pid, firstSeen: new Date(existing.firstSeen).toISOString()
        });
      }
    }
  }

  if (toLog.length === 0) return;

  // Phase 9: JSON-lines log format (structured, not concatenated string)
  const logLine = JSON.stringify({ ts: new Date(now).toISOString(), unknownPrograms: toLog }) + "\n";
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) logger.error("Failed to write to unknown_programs.log", { error: err.message });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4️⃣  ACCESSOR FUNCTIONS (clean API for future use)
// ═══════════════════════════════════════════════════════════════════════════════

function getProgramMetadata(programId) {
  const liq = LIQUIDITY_PROGRAMS[programId];
  if (liq) return { ...liq, type: "liquidity" };
  const agg = AGGREGATORS[programId];
  if (agg) return { name: agg, type: "aggregator", ...(AGGREGATOR_META[programId] || {}) };
  return null;
}

function isAggregator(programId) {
  return !!AGGREGATORS[programId];
}

function isLiquidity(programId) {
  return !!LIQUIDITY_PROGRAMS[programId];
}

function getUnknownProgramStats() {
  const stats = [];
  for (const [pid, data] of unknownProgramBuffer.entries()) {
    stats.push({ programId: pid, ...data });
  }
  return stats.sort((a, b) => b.count - a.count);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5️⃣  FREEZE REGISTRIES (prevent runtime mutation)
// ═══════════════════════════════════════════════════════════════════════════════

Object.freeze(AGGREGATORS);
Object.freeze(AGGREGATOR_META);
Object.freeze(LIQUIDITY_PROGRAMS);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS (backward compatible)
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  AGGREGATORS,
  AGGREGATOR_META,
  LIQUIDITY_PROGRAMS,
  processUnknownPrograms,
  getProgramMetadata,
  isAggregator,
  isLiquidity,
  getUnknownProgramStats
};