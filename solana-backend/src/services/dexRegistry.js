// src/services/dexRegistry.js — v15 Complete Solana DEX Classification Engine
// ─────────────────────────────────────────────────────────────────────────────
// Full coverage of ALL active Solana DEX programs as of March 2026.
// Backward compatible: AGGREGATORS[pid] returns truthy string.
// Backward compatible: LIQUIDITY_PROGRAMS[pid] returns { dex, source }.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════════
// 1️⃣  AGGREGATOR REGISTRY — Programs that route swaps through liquidity pools
// ═══════════════════════════════════════════════════════════════════════════════

const AGGREGATORS = {
  // ── Jupiter (primary aggregator on Solana) ──
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter V6",
  "JUP5cHjnnCx2DppVsufsLrWH8UzSmbiaiv2eFzVAMQJ": "Jupiter V5",
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": "Jupiter V4",
  "JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1sS3nF": "Jupiter V3",
  "JUP2jxvXaqu7NQY1GmWEBidKvFqwYW2H2gEbLcwKMA5": "Jupiter V2",
  "jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu": "Jupiter Limit",
  "RVKd61ztZW9rEtXc1z7fXAFz2uVH54camzato3tr1cG": "Jupiter Limit Order V2",
  "DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23": "Jupiter DCA",

  // ── Raydium Router ──
  "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS":  "Raydium Router",

  // ── PumpSwap Router ──
  "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH": "PumpSwap Router",

  // ── Prism ──
  "PRSMNsEPqh5TpcqYhE3G8U4BhcSMyrX9pP9q1f5g3D8": "Prism",

  // ── DFlow ──
  "DFL1zNkaGPWm1BqAVqRjCZvHmwTFrEaJtbzJWUo1wSj": "DFlow",
  "DFLowMQXN4W5z72zM5AZFqBfS9R1pWqU2j1QzWv6A5t": "DFlow V4",

  // ── Meteora Router ──
  "LBUZKhRxPF3XUpBCjp4kVn14nzKUKb4JeB3S1pStb4w": "Meteora DB (Router)",

  // ── 1inch ──
  "1iNchozjAM24K4TEnQzG5F5FDEYt258v7BpeM44T8g4": "1inch",

  // ── Kyber ──
  "kyberSWaPkE6fQZfKsD6v5oDqgAEMqWJd6wFkZbUvN": "KyberSwap",

  // ── Okx DEX ──
  "6m2CDdhRgxpH4WjvdzxAYbGxwdGUz5MziiL5jek2kBma": "OKX DEX",

  // ── Dexlab ──
  "DexLab11111111111111111111111111111111111111": "DexLab",
};

const AGGREGATOR_META = {
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": { name: "Jupiter", category: "aggregator", version: "v6", ecosystem: "Jupiter",  executionType: "routed", isActive: true },
  "JUP5cHjnnCx2DppVsufsLrWH8UzSmbiaiv2eFzVAMQJ": { name: "Jupiter", category: "aggregator", version: "v5", ecosystem: "Jupiter",  executionType: "routed", isActive: false },
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": { name: "Jupiter", category: "aggregator", version: "v4", ecosystem: "Jupiter",  executionType: "routed", isActive: false },
  "JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1sS3nF": { name: "Jupiter", category: "aggregator", version: "v3", ecosystem: "Jupiter",  executionType: "routed", isActive: false },
  "JUP2jxvXaqu7NQY1GmWEBidKvFqwYW2H2gEbLcwKMA5": { name: "Jupiter", category: "aggregator", version: "v2", ecosystem: "Jupiter",  executionType: "routed", isActive: false },
  "jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu": { name: "Jupiter", category: "aggregator", version: "limit", ecosystem: "Jupiter", executionType: "routed", isActive: true },
  "RVKd61ztZW9rEtXc1z7fXAFz2uVH54camzato3tr1cG": { name: "Jupiter", category: "aggregator", version: "limit-v2", ecosystem: "Jupiter", executionType: "routed", isActive: true },
  "DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23": { name: "Jupiter", category: "aggregator", version: "dca", ecosystem: "Jupiter", executionType: "routed", isActive: true },
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
// 2️⃣  LIQUIDITY PROGRAM REGISTRY — ALL active Solana DEX programs
// ═══════════════════════════════════════════════════════════════════════════════

const LIQUIDITY_PROGRAMS = {
  // ── Raydium ──
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { dex: "Raydium", source: "AMM_V4",       category: "liquidity", invariant: "AMM",   ecosystem: "Raydium",  version: "v4",       riskLevel: "low", isActive: true },
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK":  { dex: "Raydium", source: "CLMM",         category: "liquidity", invariant: "CLMM",  ecosystem: "Raydium",  version: "CLMM",     riskLevel: "low", isActive: true },
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C":  { dex: "Raydium", source: "CPMM",         category: "liquidity", invariant: "CPMM",  ecosystem: "Raydium",  version: "CPMM",     riskLevel: "low", isActive: true },
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1":  { dex: "Raydium", source: "AMM_V4",       category: "liquidity", invariant: "AMM",   ecosystem: "Raydium",  version: "v4-alt",   riskLevel: "low", isActive: true },
  "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS":   { dex: "Raydium", source: "Router",       category: "liquidity", invariant: "AMM",   ecosystem: "Raydium",  version: "router",   riskLevel: "low", isActive: true },
  "RVKd61ztZW9rEtXc1z7fXAFz2uVH54camzato3tr1cG":   { dex: "Raydium", source: "AMM_V4",       category: "liquidity", invariant: "AMM",   ecosystem: "Raydium",  version: "v4-new",   riskLevel: "low", isActive: true },
  "27haf8L6oxUeXrHrgEgsexjSY5hbVUWEmvv9Nyxg8vQv":  { dex: "Raydium", source: "LaunchLab",    category: "liquidity", invariant: "AMM",   ecosystem: "Raydium",  version: "launchlab", riskLevel: "medium", isActive: true },

  // ── Orca ──
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc":   { dex: "Orca", source: "Whirlpool",       category: "liquidity", invariant: "CLMM",  ecosystem: "Orca", version: "whirlpool",  riskLevel: "low", isActive: true },
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP":  { dex: "Orca", source: "TokenSwap V2",    category: "liquidity", invariant: "AMM",   ecosystem: "Orca", version: "tokenswap",  riskLevel: "low", isActive: true },
  "DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1":  { dex: "Orca", source: "TokenSwap V1",    category: "liquidity", invariant: "AMM",   ecosystem: "Orca", version: "v1",         riskLevel: "low", isActive: false },

  // ── Meteora ──
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB":  { dex: "Meteora", source: "Dynamic AMM",  category: "liquidity", invariant: "AMM",  ecosystem: "Meteora", version: "dynamic",  riskLevel: "low", isActive: true },
  "LBUZKhRxPF3XUpBCjp4kVn14nzKUKb4JeB3S1pStb4w":   { dex: "Meteora", source: "DLMM",          category: "liquidity", invariant: "CLMM", ecosystem: "Meteora", version: "dlmm",     riskLevel: "low", isActive: true },
  "M3M3B1Dv6RdH9KPi5dXLjCXnULzE3EByEPHR8VNBkxD":   { dex: "Meteora", source: "M3M3",          category: "liquidity", invariant: "AMM",  ecosystem: "Meteora", version: "m3m3",     riskLevel: "medium", isActive: true },

  // ── Pump.fun ──
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA":    { dex: "Pump.fun", source: "BondingCurve",          category: "liquidity", invariant: "bonding-curve", ecosystem: "Pump", version: "v1",       riskLevel: "high", isActive: true },
  "6EF8rrecthR5Dkzon8Nwu78hRvfMAt9Gj1nK1u8YxKk2":   { dex: "Pump.fun", source: "BondingCurve",          category: "liquidity", invariant: "bonding-curve", ecosystem: "Pump", version: "v1-alt",   riskLevel: "high", isActive: true },
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P":    { dex: "Pump.fun", source: "BondingCurve Standard", category: "liquidity", invariant: "bonding-curve", ecosystem: "Pump", version: "standard", riskLevel: "high", isActive: true },

  // ── PumpSwap ──
  "PSwapMd2kKx8gT2Q3UvB4w5eJ9h5wP3H7V3b2gqzF1b":  { dex: "PumpSwap", source: "AMM",           category: "liquidity", invariant: "AMM",           ecosystem: "Pump",    version: "amm",    riskLevel: "medium", isActive: true },
  "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH":   { dex: "PumpSwap", source: "Router",        category: "liquidity", invariant: "AMM",           ecosystem: "Pump",    version: "router", riskLevel: "medium", isActive: true },

  // ── Moonshot ──
  "MoonCVVNZFSYkqNXP6bxHLb6ihrEMZQn7GH4u5nMWjA":   { dex: "Moonshot", source: "Contract",      category: "liquidity", invariant: "bonding-curve", ecosystem: "Moonshot", version: "v1",   riskLevel: "high", isActive: true },

  // ── Phoenix (CLOB) ──
  "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY":    { dex: "Phoenix", source: "OrderBook",      category: "liquidity", invariant: "CLOB", ecosystem: "Phoenix",  version: "v1", riskLevel: "low", isActive: true },

  // ── OpenBook (Serum successor) ──
  "opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EQQoow":    { dex: "OpenBook", source: "CLOB V2",       category: "liquidity", invariant: "CLOB", ecosystem: "OpenBook", version: "v2", riskLevel: "low", isActive: true },
  "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX":    { dex: "OpenBook", source: "Serum V3",      category: "liquidity", invariant: "CLOB", ecosystem: "OpenBook", version: "serum-v3", riskLevel: "low", isActive: false },
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin":   { dex: "OpenBook", source: "Serum V3 Alt",  category: "liquidity", invariant: "CLOB", ecosystem: "OpenBook", version: "serum-v3-alt", riskLevel: "low", isActive: false },

  // ── Jupiter (self-executing swaps) ──
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4":   { dex: "Jupiter", source: "Aggregator V6",  category: "liquidity", invariant: "AMM", ecosystem: "Jupiter", version: "v6",    riskLevel: "low", isActive: true },
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB":   { dex: "Jupiter", source: "Aggregator V4",  category: "liquidity", invariant: "AMM", ecosystem: "Jupiter", version: "v4",    riskLevel: "low", isActive: false },
  "jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu":   { dex: "Jupiter", source: "Limit Order",    category: "liquidity", invariant: "AMM", ecosystem: "Jupiter", version: "limit", riskLevel: "low", isActive: true },

  // ── FluxBeam ──
  "FLUXubRmkEi2q6K3Y9kBPg924BgnTgDkEBSzG5R8V2y":   { dex: "FluxBeam", source: "Swap", category: "liquidity", invariant: "AMM", ecosystem: "FluxBeam", version: "v1", riskLevel: "medium", isActive: true },

  // ── Lifinity ──
  "EewxydAPCCVuNEyrVN68PuSYdQ7wKn27V5Gjeoi8dy3S":   { dex: "Lifinity", source: "V2",    category: "liquidity", invariant: "CLMM", ecosystem: "Lifinity", version: "v2", riskLevel: "low", isActive: true },
  "2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c":  { dex: "Lifinity", source: "V1",    category: "liquidity", invariant: "CLMM", ecosystem: "Lifinity", version: "v1", riskLevel: "low", isActive: false },

  // ── Saber (Stable AMM) ──
  "SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ":    { dex: "Saber", source: "StableSwap", category: "liquidity", invariant: "stable-AMM", ecosystem: "Saber", version: "v1", riskLevel: "low", isActive: true },

  // ── GooseFX ──
  "GFXsSL5sSaDfNFQUYsHekbWBW1TsFdjDYzACh62tEHxn":   { dex: "GooseFX", source: "SSL V2",   category: "liquidity", invariant: "CLMM",  ecosystem: "GooseFX", version: "ssl-v2", riskLevel: "medium", isActive: true },

  // ── Aldrin ──
  "AMM55ShdoNHZKHr7vnnm7MVkqSS8rZMz9TmKMKF2coux":   { dex: "Aldrin", source: "AMM V2",    category: "liquidity", invariant: "AMM",   ecosystem: "Aldrin", version: "v2", riskLevel: "medium", isActive: true },
  "CURVGoZn8zycx6FXwwevgBTB2gVvdbGTEFvMJbsTkAH":    { dex: "Aldrin", source: "AMM V1",    category: "liquidity", invariant: "AMM",   ecosystem: "Aldrin", version: "v1", riskLevel: "medium", isActive: false },

  // ── Crema Finance ──
  "6MLxLqiXaaSt6w9hPBpyhse6JVeNEqzXgMjhpF5bJsCA":   { dex: "Crema",  source: "CLMM",      category: "liquidity", invariant: "CLMM",  ecosystem: "Crema",  version: "v1", riskLevel: "medium", isActive: true },
  "CLMM9tUoggJu2wagPkkqs9eFG4BWhVBZWkP1qv3Sp7tR":   { dex: "Crema",  source: "CLMM V2",   category: "liquidity", invariant: "CLMM",  ecosystem: "Crema",  version: "v2", riskLevel: "medium", isActive: true },

  // ── Invariant ──
  "HyaB3W9q6XdA5xwpU4XnSZV94htfmbmqN3wWRqbZ56yK":   { dex: "Invariant", source: "CLMM",   category: "liquidity", invariant: "CLMM",  ecosystem: "Invariant", version: "v1", riskLevel: "medium", isActive: true },

  // ── Marinade Finance (liquid staking DEX) ──
  "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD":    { dex: "Marinade", source: "Staking",  category: "liquidity", invariant: "AMM",   ecosystem: "Marinade", version: "v1", riskLevel: "low", isActive: true },

  // ── Penguin Finance ──
  "PENGuiN1xFCWsYzH5evVnFLUPbmHH1ZVcpL7TXp7SJH":   { dex: "Penguin", source: "AMM",       category: "liquidity", invariant: "AMM",   ecosystem: "Penguin",  version: "v1", riskLevel: "medium", isActive: true },

  // ── Bonkswap ──
  "BSwp6bEBihVLdqJRKGgzjcGLHkcTuzmSo1TQkHepzH8p":   { dex: "Bonkswap", source: "AMM",     category: "liquidity", invariant: "AMM",   ecosystem: "Bonk",     version: "v1", riskLevel: "medium", isActive: true },

  // ── Step Finance ──
  "STeP38VdbhpbjNLdAGWbcvNUBWavbP6Mtqze5r1ycyG":    { dex: "Step Finance", source: "AMM",  category: "liquidity", invariant: "AMM",   ecosystem: "Step",     version: "v1", riskLevel: "medium", isActive: true },

  // ── Cropper Finance ──
  "CTMAxxk34HjKWxQ3QLZK1HpaLXmBveao3ESePXbiyfzh":   { dex: "Cropper", source: "AMM",       category: "liquidity", invariant: "AMM",   ecosystem: "Cropper",  version: "v1", riskLevel: "medium", isActive: true },

  // ── Saros Finance ──
  "SSwapUtytfBdBn1b9NUGG6foMVPtcWgpRU32HToDUZr":    { dex: "Saros",  source: "AMM",        category: "liquidity", invariant: "AMM",   ecosystem: "Saros",    version: "v1", riskLevel: "medium", isActive: true },

  // ── Sencha / Sentre ──
  "SCHAtsf8mbjyjiv4LkhLKutTf6JnZAbdJKFkXQNMFHZ":    { dex: "Sencha", source: "AMM",        category: "liquidity", invariant: "AMM",   ecosystem: "Sencha",   version: "v1", riskLevel: "medium", isActive: true },

  // ── Mercurial (now Meteora) ──
  "MERLuDFBMoSM8dLGo1mjcFTo2a5noTNjDHPMNkTkQaW":    { dex: "Mercurial", source: "StableSwap", category: "liquidity", invariant: "stable-AMM", ecosystem: "Mercurial", version: "v1", riskLevel: "low", isActive: false },
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
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  "AuthorityHJhFQCHmD9SQ14JLPTHXsXEbB9CdMRptCR6ip",
]);

const LOG_FILE = path.join(__dirname, '../../logs/unknown_programs.log');
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const MAX_BUFFER_SIZE = 10000;

function processUnknownPrograms(activePrograms) {
  if (!activePrograms || activePrograms.length === 0) return;

  const now = Date.now();
  const toLog = [];

  for (const pid of activePrograms) {
    if (SOLANA_SYSTEM_PROGRAMS.has(pid)) continue;
    if (LIQUIDITY_PROGRAMS[pid]) continue;
    if (AGGREGATORS[pid]) continue;

    toLog.push(pid);
    const existing = unknownProgramBuffer.get(pid);

    if (!existing) {
      if (unknownProgramBuffer.size >= MAX_BUFFER_SIZE) {
        const oldestKey = unknownProgramBuffer.keys().next().value;
        unknownProgramBuffer.delete(oldestKey);
      }
      unknownProgramBuffer.set(pid, { count: 1, firstSeen: now, lastSeen: now });
    } else {
      existing.count++;
      existing.lastSeen = now;

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

  const logLine = JSON.stringify({ ts: new Date(now).toISOString(), unknownPrograms: toLog }) + "\n";
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) logger.error("Failed to write to unknown_programs.log", { error: err.message });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4️⃣  ACCESSOR FUNCTIONS
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

function getRegistryStats() {
  return {
    totalAggregators:       Object.keys(AGGREGATORS).length,
    totalLiquidityPrograms: Object.keys(LIQUIDITY_PROGRAMS).length,
    unknownBufferSize:      unknownProgramBuffer.size,
    uniqueDexes:            [...new Set(Object.values(LIQUIDITY_PROGRAMS).map(p => p.dex))].length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5️⃣  FREEZE REGISTRIES (prevent runtime mutation)
// ═══════════════════════════════════════════════════════════════════════════════

Object.freeze(AGGREGATORS);
Object.freeze(AGGREGATOR_META);
Object.freeze(LIQUIDITY_PROGRAMS);

module.exports = {
  AGGREGATORS,
  AGGREGATOR_META,
  LIQUIDITY_PROGRAMS,
  processUnknownPrograms,
  getProgramMetadata,
  isAggregator,
  isLiquidity,
  getUnknownProgramStats,
  getRegistryStats,
};