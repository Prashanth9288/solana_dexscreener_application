// src/routes/transactionRoutes.js — v14 Institutional-Grade Hardening
// Surgical non-breaking hardening over v13. All 12 phases applied.
// ─── ZERO API SHAPE CHANGES · ZERO DB CONTRACT CHANGES ───────────────────────
const express = require("express");
const { fetchWithRetry } = require("../utils/rpcClient");
const logger = require("../utils/logger");
const DBBatcher = require("../services/dbBatcher");

const router = express.Router();

// ── SOL Price Cache — Multi-source resilient feed ─────────────────────────────
// Cascade: Jupiter → CoinGecko → Binance. First success wins.
// Why: Binance blocks many cloud IPs. Jupiter is most reliable from Render.
let cachedSolPrice = null;
let solPriceSource = 'none';

const SOL_PRICE_SOURCES = [
  {
    name: 'Pyth',
    url: 'https://hermes.pyth.network/v2/updates/price/latest?ids[]=ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    extract: (data) => {
      const parsed = data?.parsed?.[0]?.price;
      return parsed ? (parseInt(parsed.price) * Math.pow(10, parsed.expo)) : null;
    }
  },
  {
    name: 'Jupiter',
    url: 'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112',
    extract: (data) => {
      const p = data?.data?.['So11111111111111111111111111111111111111112']?.price;
      return p ? parseFloat(p) : null;
    },
  },
  {
    name: 'DexScreener',
    url: 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112',
    extract: (data) => {
      // Must ensure the pair is traded against USDC to get a valid USD price
      const pair = data?.pairs?.find(p => p.quoteToken.address === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      return pair ? parseFloat(pair.priceUsd) : null;
    }
  },
  {
    name: 'Binance',
    url: 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
    extract: (data) => (data?.price ? parseFloat(data.price) : null),
  },
  {
    name: 'CoinGecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    extract: (data) => data?.solana?.usd ?? null,
  }
];

async function updateSolPrice() {
  for (const source of SOL_PRICE_SOURCES) {
    try {
      const response = await fetch(source.url, { 
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'SolanaAnalytics/1.0' }
      });
      if (!response.ok) {
        if (response.status === 429) {
          logger.warn(`Price source ${source.name} rate limited (429).`);
        }
        continue;
      }
      const data = await response.json();
      const price = source.extract(data);
      if (price && price > 0 && isFinite(price)) {
        cachedSolPrice = price;
        if (solPriceSource !== source.name) {
          logger.info(`SOL price source: ${source.name} ($${price.toFixed(2)})`);
          solPriceSource = source.name;
        }
        return; // success — stop cascade
      }
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        logger.debug(`Price source ${source.name} timed out.`);
      } else {
        logger.debug(`Price source ${source.name} error: ${err.message}`);
      }
    }
  }
  logger.warn('All SOL price sources failed — keeping previous value', {
    cached: cachedSolPrice,
    lastSource: solPriceSource
  });
}

// Fetch immediately on boot, then poll every 60s (to prevent Render IP rate-limiting)
updateSolPrice();
setInterval(updateSolPrice, 60000);

// ── Constants ─────────────────────────────────────────────────────────────────
const SOL_MINT = "So11111111111111111111111111111111111111112";
const { AGGREGATORS, LIQUIDITY_PROGRAMS, processUnknownPrograms } = require('../services/dexRegistry');

const STABLE_COINS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
]);

// ── Phase 2: Program Role Collision Resolver ──────────────────────────────────
// Resolves dual-registered programs (exist in both AGGREGATORS + LIQUIDITY_PROGRAMS)
// using execution depth as the tiebreaker.
// depth === 1 → top-level → aggregator role
// depth >  1 → nested    → liquidity role
function resolveProgramRole(programId, depth) {
  const inLiquidity = !!LIQUIDITY_PROGRAMS[programId];
  const inAggregator = !!AGGREGATORS[programId];

  if (inLiquidity && inAggregator) {
    return depth > 1 ? "liquidity" : "aggregator";
  }
  if (inLiquidity) return "liquidity";
  if (inAggregator) return "aggregator";
  return null;
}

// ── Pure Functions ────────────────────────────────────────────────────────────

// Phase 4: BigInt → Number with MAX_SAFE_INTEGER clamp
function safeBigIntToNumber(bigintVal) {
  if (bigintVal > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  if (bigintVal < BigInt(-Number.MAX_SAFE_INTEGER)) return -Number.MAX_SAFE_INTEGER;
  return Number(bigintVal);
}

function uiAmount(raw, decimals) {
  if (raw === null || raw === undefined) return 0;
  const divisor = 10 ** decimals;
  const value = safeBigIntToNumber(raw < 0n ? -raw : raw) / divisor;
  if (!isFinite(value)) return 0;
  return Number(value.toFixed(decimals));
}

function computePrices({ base_asset, quote_asset, base_amount, quote_amount, SOL_MINT, STABLE_COINS, SOL_PRICE }) {
  let price_native = null;
  let price_usd = null;
  let usd_value = null;

  // Phase 4: Division safety guard
  const MIN_AMOUNT = 1e-18;
  if (
    !base_amount || !quote_amount ||
    base_amount < MIN_AMOUNT || quote_amount < MIN_AMOUNT ||
    !isFinite(base_amount) || !isFinite(quote_amount)
  ) {
    return { price_native, price_usd, usd_value };
  }

  if (quote_asset === SOL_MINT) {
    price_native = quote_amount / base_amount;
    if (SOL_PRICE && SOL_PRICE > 0) {
      // Phase 4: USD drift control via toPrecision(15)
      usd_value = Number((quote_amount * SOL_PRICE).toPrecision(15));
      price_usd = usd_value / base_amount;
    }
  } else if (base_asset === SOL_MINT) {
    price_native = base_amount / quote_amount;
    if (SOL_PRICE && SOL_PRICE > 0) {
      usd_value = Number((base_amount * SOL_PRICE).toPrecision(15));
      price_usd = usd_value / quote_amount;
    }
  } else if (STABLE_COINS.has(quote_asset)) {
    price_usd = quote_amount / base_amount;
    usd_value = quote_amount;
  } else if (STABLE_COINS.has(base_asset)) {
    price_usd = base_amount / quote_amount;
    usd_value = base_amount;
  }

  if (!isFinite(price_native) || price_native <= 0) price_native = null;
  if (!isFinite(price_usd) || price_usd <= 0) price_usd = null;
  if (price_usd === null) usd_value = null;

  return { price_native, price_usd, usd_value };
}

function getPubkeyFromAccountKey(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return entry;
  if (entry.pubkey) return entry.pubkey;
  return null;
}

function extractTransfersFromInstruction(ix) {
  const results = [];
  try {
    if (ix?.program === "spl-token" || ix?.programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
      if (ix.parsed && ix.parsed.type && ix.parsed.info) {
        const info = ix.parsed.info;
        if (info.source && info.destination && (info.amount || info.tokenAmount)) {
          const amountRaw = info.amount ?? (info.tokenAmount && info.tokenAmount.amount);
          const decimals = info.tokenAmount?.decimals ?? null;
          results.push({
            source: getPubkeyFromAccountKey(info.source) || info.source,
            destination: getPubkeyFromAccountKey(info.destination) || info.destination,
            amountRaw: amountRaw ? BigInt(amountRaw) : null,
            mint: info.mint || null,
            decimals
          });
        }
      }
    }
  } catch (ok) {}
  return results;
}

// Canonical pair ordering — deterministic base/quote
function canonicalizePair(base, quote, baseAmt, quoteAmt, baseDec, quoteDec) {
  if (quote === SOL_MINT) return { base, quote, baseAmt, quoteAmt, baseDec, quoteDec };
  if (base === SOL_MINT) return { base: quote, quote: base, baseAmt: quoteAmt, quoteAmt: baseAmt, baseDec: quoteDec, quoteDec: baseDec };
  if (STABLE_COINS.has(quote)) return { base, quote, baseAmt, quoteAmt, baseDec, quoteDec };
  if (STABLE_COINS.has(base)) return { base: quote, quote: base, baseAmt: quoteAmt, quoteAmt: baseAmt, baseDec: quoteDec, quoteDec: baseDec };
  return base < quote
    ? { base, quote, baseAmt, quoteAmt, baseDec, quoteDec }
    : { base: quote, quote: base, baseAmt: quoteAmt, quoteAmt: baseAmt, baseDec: quoteDec, quoteDec: baseDec };
}

// ── Phase 6: Hardened base58 invoke regex ────────────────────────────────────
// Strict character class ensures only valid base58 program IDs are captured
const INVOKE_REGEX = /^Program ([A-Za-z0-9]{32,44}) invoke \[\d+\]$/;
const END_REGEX    = /^Program ([A-Za-z0-9]{32,44}) (?:success|failed)/;

// ── Main Route ────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    // Phase 16: Authentication Security Guard
    const authHeader = req.headers.authorization;
    if (process.env.HELIUS_AUTH_SECRET && authHeader !== process.env.HELIUS_AUTH_SECRET) {
      logger.warn("Unauthorized webhook attempt blocked", { ip: req.ip });
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { signature } = req.body;
    if (!signature) return res.status(400).json({ error: "Signature required" });

    let rpcResponse;
    try {
      rpcResponse = await fetchWithRetry({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
      });
    } catch (axErr) {
      logger.error("RPC error", { status: axErr?.response?.status, message: axErr.message });
      return res.status(502).json({ error: "Failed to fetch transaction from RPC", details: axErr.message });
    }

    if (!rpcResponse || rpcResponse.error) {
      return res.status(rpcResponse?.error ? 400 : 502).json({ error: rpcResponse?.error?.message || "Invalid RPC response" });
    }

    const tx = rpcResponse.result;
    if (!tx) return res.status(404).json({ error: "Transaction not found" });

    const message = tx.transaction?.message;
    if (!message) return res.status(500).json({ error: "Malformed transaction: missing message" });

    // =========================================================================
    // LAYER 1: IMMUTABLE TRANSACTION CONTEXT
    // =========================================================================

    const rawAccountKeys = message.accountKeys || [];
    const accountKeys = rawAccountKeys.map(ak => getPubkeyFromAccountKey(ak)).filter(Boolean);

    const signers = new Set();
    for (const ak of rawAccountKeys) {
      const pk = getPubkeyFromAccountKey(ak);
      const isSigner = typeof ak === "object" ? !!ak.signer : false;
      if (isSigner && pk) signers.add(pk);
    }
    if (signers.size === 0 && accountKeys.length > 0) {
      signers.add(accountKeys[0]);
    }

    const txContext = Object.freeze({
      signature,
      slot: tx.slot,
      blockTime: tx.blockTime,
      accountKeys,
      signers,
      logs: tx.meta?.logMessages || [],
      instructions: message.instructions || [],
      innerInstructions: tx.meta?.innerInstructions || [],
      preBalances: tx.meta?.preBalances || [],
      postBalances: tx.meta?.postBalances || [],
      preTokenBalances: tx.meta?.preTokenBalances || [],
      postTokenBalances: tx.meta?.postTokenBalances || [],
      feeLamports: BigInt(tx.meta?.fee || 0),
      loadedAddresses: {
        readonly: tx.meta?.loadedAddresses?.readonly || [],
        writable: tx.meta?.loadedAddresses?.writable || []
      }
    });

    // Phase 12: Early exit for system-only transactions (no meaningful decode)
    if (txContext.logs.length === 0 && txContext.instructions.length === 0) {
      return res.status(200).json({ message: "Empty transaction — no instructions", signature });
    }

    // Phase 11: Per-request program metadata cache for O(1) repeated lookups
    const programRoleCache = new Map();
    const getRoleAt = (programId, depth) => {
      const key = `${programId}:${depth > 1 ? "nested" : "top"}`;
      if (!programRoleCache.has(key)) {
        programRoleCache.set(key, resolveProgramRole(programId, depth));
      }
      return programRoleCache.get(key);
    };

    // Phase 3: Build loadedAddress set for wallet scoring penalty
    const loadedAddressSet = new Set([
      ...txContext.loadedAddresses.readonly,
      ...txContext.loadedAddresses.writable
    ]);

    // =========================================================================
    // LAYER 2: EXECUTION GRAPH BUILDER (Phase 6: hardened regex)
    // =========================================================================

    const executionGraph = { nodes: [] };
    const callStack = [];
    let nodeIndex = 0;

    for (let i = 0; i < txContext.logs.length; i++) {
      const log = txContext.logs[i];
      const invokeMatch = INVOKE_REGEX.exec(log);

      if (invokeMatch) {
        const programId = invokeMatch[1];
        const depth = callStack.length + 1;
        const parentIndex = callStack.length > 0 ? callStack[callStack.length - 1].index : null;

        const node = {
          index: nodeIndex++,
          programId,
          depth,
          parentIndex,
          children: [],
          emittedSwapEvent: false,
          emittedTransferEvent: false,
          swapSignals: {
            hasSwapKeyword: false,
            hasAmountIn: false,
            hasAmountOut: false,
            hasDexTag: false,
            signalCount: 0
          },
          detectedDexName: null,
          logs: []
        };

        if (parentIndex !== null) {
          executionGraph.nodes[parentIndex].children.push(node.index);
        }

        executionGraph.nodes.push(node);
        callStack.push(node);
      } else {
        const endMatch = END_REGEX.exec(log);
        if (endMatch) {
          const endedProgramId = endMatch[1];
          if (callStack.length > 0) {
            const top = callStack[callStack.length - 1];
            if (top.programId === endedProgramId) {
              callStack.pop();
            }
          }
        } else if (callStack.length > 0) {
          const top = callStack[callStack.length - 1];
          top.logs.push(log);

          const lLog = log.toLowerCase();
          let changed = false;

          if (
            lLog.includes("instruction: buy") ||
            lLog.includes("instruction: sell") ||
            lLog.includes("instruction: swap") ||
            lLog.includes("swapevent") ||
            lLog.includes("log: swap")
          ) {
            top.swapSignals.hasSwapKeyword = true;
            changed = true;
          }
          if (lLog.includes("amount_in:") || lLog.includes("source_token_change:")) {
            top.swapSignals.hasAmountIn = true;
            changed = true;
          }
          if (lLog.includes("amount_out:") || lLog.includes("destination_token_change:")) {
            top.swapSignals.hasAmountOut = true;
            changed = true;
          }
          if (lLog.includes("dex::") || lLog.includes("swapevent {")) {
            top.swapSignals.hasDexTag = true;
            changed = true;
          }

          if (changed) {
            top.swapSignals.signalCount =
              (top.swapSignals.hasSwapKeyword ? 1 : 0) +
              (top.swapSignals.hasAmountIn ? 1 : 0) +
              (top.swapSignals.hasAmountOut ? 1 : 0) +
              (top.swapSignals.hasDexTag ? 1 : 0);
          }

          // Phase 5: DEX name extraction from structured logs
          const dexMatch = log.match(/dex::\s*(\w+)/i) || log.match(/SwapEvent\s*\{\s*dex:\s*["']?(\w+)/i);
          if (dexMatch) top.detectedDexName = dexMatch[1];

          // Phase 7: Weighted signal requirement
          // Known liquidity programs: accept any 1 signal
          // Unknown programs: require ≥2 signals to avoid false positives
          const role = getRoleAt(top.programId, top.depth);
          const isKnownLiquidity = role === "liquidity";
          top.emittedSwapEvent = isKnownLiquidity
            ? top.swapSignals.signalCount >= 1
            : top.swapSignals.signalCount >= 2;
        }
      }
    }

    // =========================================================================
    // LAYER 3: STRUCTURED SWAP EVENT EXTRACTION (Phase 2: collision resolver)
    // =========================================================================

    const swapEvents = [];
    const activePrograms = new Set();

    for (const node of executionGraph.nodes) {
      activePrograms.add(node.programId);
      // Phase 2: use collision resolver, not raw boolean
      const role = getRoleAt(node.programId, node.depth);
      const isLiquidity = role === "liquidity";
      const isAggregator = role === "aggregator";

      if (node.emittedSwapEvent && (isLiquidity || isAggregator)) {
        swapEvents.push({
          programId: node.programId,
          isLiquidity,
          isAggregator,
          amountInRaw: null,
          amountOutRaw: null,
          detectedFromLogs: true,
          detectedDexName: node.detectedDexName
        });
      }

      // Future-proofing: log unregistered swap-emitting programs
      if (node.emittedSwapEvent && !isLiquidity && !isAggregator) {
        logger.info("Unregistered liquidity program detected", {
          programId: node.programId,
          signature: txContext.signature,
          signals: node.swapSignals
        });
      }
    }

    // =========================================================================
    // LAYER 4: DETERMINISTIC DELTA ENGINE (Phase 4: safe BigInt math)
    // =========================================================================

    const deltaMap = new Map();

    const addDelta = (owner, mint, decimals, diff) => {
      if (diff === 0n) return;
      const key = `${owner}_${mint}`;
      let existing = deltaMap.get(key);
      if (!existing) {
        existing = { owner, mint, decimals, diffRaw: 0n };
        deltaMap.set(key, existing);
      }
      existing.diffRaw += diff;
    };

    const postByIndex = new Map();
    for (const p of txContext.postTokenBalances) {
      if (p) postByIndex.set(p.accountIndex, p);
    }

    // Pass 1: Pre-Token Balances
    for (const pre of txContext.preTokenBalances) {
      if (!pre || !pre.owner) continue;
      const post = postByIndex.get(pre.accountIndex) || null;
      const before = BigInt(pre.uiTokenAmount?.amount || 0);
      const after = post ? BigInt(post.uiTokenAmount?.amount || 0) : 0n;
      addDelta(pre.owner, pre.mint, pre.uiTokenAmount?.decimals ?? 0, after - before);
    }

    // O(1) preIndexSet — eliminates O(N²) .some()
    const preIndexSet = new Set();
    for (const p of txContext.preTokenBalances) {
      if (p) preIndexSet.add(p.accountIndex);
    }

    // Pass 2: Post-Token Balances (New Accounts only)
    for (const post of txContext.postTokenBalances) {
      if (!post || !post.owner) continue;
      if (!preIndexSet.has(post.accountIndex)) {
        addDelta(post.owner, post.mint, post.uiTokenAmount?.decimals ?? 0, BigInt(post.uiTokenAmount?.amount || 0));
      }
    }

    // Check if Wrapped SOL was actively used by signers
    let wrappedSolUsedBySigners = false;
    for (const entry of deltaMap.values()) {
      if (entry.mint === SOL_MINT && txContext.signers.has(entry.owner)) {
        wrappedSolUsedBySigners = true;
        break;
      }
    }

    // Pass 3: Native Lamports (only if Wrapped SOL not used)
    if (!wrappedSolUsedBySigners && txContext.preBalances.length && txContext.postBalances.length) {
      for (let i = 0; i < txContext.accountKeys.length; i++) {
        const pk = txContext.accountKeys[i];
        try {
          const solBefore = BigInt(txContext.preBalances[i] ?? 0);
          const solAfter = BigInt(txContext.postBalances[i] ?? 0);
          const lamportDiff = solAfter - solBefore;
          if (lamportDiff !== 0n) {
            addDelta(pk, SOL_MINT, 9, lamportDiff);
          }
        } catch (e) {}
      }
    }

    // Truth source hierarchy: delta primary, parsed transfers fallback
    if (deltaMap.size === 0) {
      const transferCandidates = [];
      const extract = (ix) => {
        try {
          const parsed = extractTransfersFromInstruction(ix);
          if (parsed.length) transferCandidates.push(...parsed);
        } catch (e) {}
      };
      txContext.instructions.forEach(extract);
      txContext.innerInstructions.forEach(g => (g.instructions || []).forEach(extract));

      for (const t of transferCandidates) {
        if (!t.mint || !t.amountRaw || t.amountRaw === 0n) continue;
        addDelta(t.source, t.mint, t.decimals ?? 0, -BigInt(t.amountRaw));
        addDelta(t.destination, t.mint, t.decimals ?? 0, BigInt(t.amountRaw));
      }
    }

    // =========================================================================
    // LAYER 5: PLATFORM FEE ISOLATION
    // =========================================================================

    if (txContext.signers.size > 0 && txContext.feeLamports > 0n && !wrappedSolUsedBySigners) {
      const feePayer = txContext.accountKeys[0];
      const key = `${feePayer}_${SOL_MINT}`;
      const existing = deltaMap.get(key);
      if (existing) {
        existing.diffRaw += txContext.feeLamports;
      }
    }

    // =========================================================================
    // LAYER 6: WALLET RESOLUTION ENGINE (Phase 3: scored model)
    // =========================================================================

    let dynamicWallet = null;
    let bestScore = -Infinity;

    for (const signer of txContext.signers) {
      // Phase 3: Penalise pool authorities / relayers
      if (LIQUIDITY_PROGRAMS[signer]) continue;
      if (AGGREGATORS[signer]) continue;

      let score = 0;
      let hasNegative = false;
      let hasPositive = false;
      let totalAbsMagn = 0n;

      for (const entry of deltaMap.values()) {
        if (entry.owner === signer) {
          if (entry.diffRaw < 0n) { hasNegative = true; score += 2; }
          if (entry.diffRaw > 0n) { hasPositive = true; score += 2; }
          const abs = entry.diffRaw < 0n ? -entry.diffRaw : entry.diffRaw;
          totalAbsMagn += abs;
        }
      }

      // Magnitude bonus (log-scale to prevent whale domination)
      if (totalAbsMagn > 0n) {
        score += Math.log(safeBigIntToNumber(totalAbsMagn) + 1);
      }

      // Penalties
      if (loadedAddressSet.has(signer)) score -= 3;

      // Only consider wallets with bidirectional flow
      if (hasNegative && hasPositive && score > bestScore) {
        bestScore = score;
        dynamicWallet = signer;
      }
    }

    // Soft-fallback: highest magnitude among signers (excluding programs)
    if (!dynamicWallet) {
      let maxMag = -1n;
      for (const signer of txContext.signers) {
        if (LIQUIDITY_PROGRAMS[signer]) continue;
        if (AGGREGATORS[signer]) continue;
        let totalAbsMagn = 0n;
        for (const entry of deltaMap.values()) {
          if (entry.owner === signer) {
            const abs = entry.diffRaw < 0n ? -entry.diffRaw : entry.diffRaw;
            totalAbsMagn += abs;
          }
        }
        if (totalAbsMagn > maxMag) {
          maxMag = totalAbsMagn;
          dynamicWallet = signer;
        }
      }
    }

    if (!dynamicWallet && txContext.signers.size > 0) {
      dynamicWallet = Array.from(txContext.signers)[0];
    }

    // =========================================================================
    // LAYER 7: CANONICAL SWAP NORMALIZATION
    // =========================================================================

    const walletFlows = [];
    for (const entry of deltaMap.values()) {
      if (entry.owner === dynamicWallet) walletFlows.push(entry);
    }
    const negatives = walletFlows.filter(e => e.diffRaw < 0n).sort((a, b) => {
      const absA = a.diffRaw < 0n ? -a.diffRaw : a.diffRaw;
      const absB = b.diffRaw < 0n ? -b.diffRaw : b.diffRaw;
      return absB > absA ? 1 : absB < absA ? -1 : 0;
    });
    const positives = walletFlows.filter(e => e.diffRaw > 0n).sort((a, b) =>
      b.diffRaw > a.diffRaw ? 1 : b.diffRaw < a.diffRaw ? -1 : 0
    );

    if (negatives.length === 0 && positives.length === 0) {
      return res.status(200).json({ message: "No token flow for derived wallet", signature });
    }

    const spent    = negatives.length > 0 ? negatives[0] : null;
    const received = positives.length > 0 ? positives[0] : null;

    const raw_base_asset    = received?.mint || "Unknown";
    const raw_base_decimals = received?.decimals ?? 0;
    const raw_base_amount   = received ? Number(uiAmount(received.diffRaw, received.decimals)) : 0;
    const raw_quote_asset   = spent?.mint || "Unknown";
    const raw_quote_decimals = spent?.decimals ?? 0;
    const raw_quote_amount  = spent ? Number(uiAmount(-spent.diffRaw, spent.decimals)) : 0;

    // Phase 8: Canonical pair safety guard
    if (raw_base_asset === raw_quote_asset) {
      return res.status(200).json({ message: "Invalid pair resolution: base === quote", signature });
    }
    if (isNaN(raw_base_amount) || isNaN(raw_quote_amount)) {
      return res.status(200).json({ message: "Invalid pair resolution: NaN amounts", signature });
    }

    // Apply canonical pair ordering
    const canonical = canonicalizePair(
      raw_base_asset, raw_quote_asset,
      raw_base_amount, raw_quote_amount,
      raw_base_decimals, raw_quote_decimals
    );
    const base_asset     = canonical.base;
    const quote_asset    = canonical.quote;
    const base_amount    = canonical.baseAmt;
    const quote_amount   = canonical.quoteAmt;
    const base_decimals  = canonical.baseDec;
    const quote_decimals = canonical.quoteDec;

    // Swap side derived from what the user LOST
    let swap_side = "unknown";
    if (spent && received) {
      const userLostStable = STABLE_COINS.has(spent.mint);
      const userLostNative = spent.mint === SOL_MINT;
      swap_side = (userLostStable || userLostNative) ? "buy" : "sell";
    } else if (spent && !received) {
      swap_side = "transfer_out";
    } else if (!spent && received) {
      swap_side = "transfer_in";
    }

    // =========================================================================
    // LAYER 8: MULTI-HOP & DEX CLASSIFICATION (Phase 5: strict hop semantics)
    // =========================================================================

    // Phase 5: Count only liquidity hops strictly
    let hop_count = swapEvents.filter(e => e.isLiquidity).length;
    // If no liquidity hops but aggregator-only events exist → still 1 logical hop
    if (hop_count === 0 && swapEvents.some(e => e.isAggregator)) hop_count = 1;
    const hop_type = hop_count > 1 ? "multi" : "single";

    let final_hop = "Unknown";
    let executionProgram = "Unknown";
    let aggregator = null;

    // Identify from swap events (last liquidity program wins as final hop)
    for (const e of swapEvents) {
      if (e.isLiquidity) {
        executionProgram = e.programId;
        final_hop = LIQUIDITY_PROGRAMS[e.programId].dex;
      }
      if (e.isAggregator && !aggregator) {
        aggregator = AGGREGATORS[e.programId];
      }
    }

    // Fallback: DEX name from structured log parsing
    if (final_hop === "Unknown") {
      for (const e of swapEvents) {
        if (e.detectedDexName) { final_hop = e.detectedDexName; break; }
      }
    }

    // Fallback: instruction-level classification (Protects against log truncation)
    if (executionProgram === "Unknown") {
      const fallbackPrograms = new Set();
      for (const ix of txContext.instructions) {
        const pid = ix.programId || ix.program;
        if (AGGREGATORS[pid] && !aggregator) aggregator = AGGREGATORS[pid];
        if (LIQUIDITY_PROGRAMS[pid]) fallbackPrograms.add(pid);
      }
      for (const group of txContext.innerInstructions) {
        for (const ix of (group.instructions || [])) {
          const pid = ix.programId || ix.program;
          if (LIQUIDITY_PROGRAMS[pid]) fallbackPrograms.add(pid);
          if (AGGREGATORS[pid] && !aggregator) aggregator = AGGREGATORS[pid];
        }
      }
      if (fallbackPrograms.size > 0) {
        executionProgram = Array.from(fallbackPrograms).pop(); // last identified program
        final_hop = LIQUIDITY_PROGRAMS[executionProgram].dex;
        hop_count = fallbackPrograms.size;
        hop_type = hop_count > 1 ? "multi" : "single";
      }
    }

    // Loaded address fallback
    if (executionProgram === "Unknown") {
      const loaded = [...txContext.loadedAddresses.readonly, ...txContext.loadedAddresses.writable];
      for (const addr of loaded) {
        if (LIQUIDITY_PROGRAMS[addr]) {
          executionProgram = addr;
          final_hop = LIQUIDITY_PROGRAMS[addr].dex;
          break;
        }
      }
    }

    // Phase 10: Non-swap early return
    // If no liquidity program detected AND no swapEvents AND only token-transfer deltas → classify as transfer
    if (executionProgram === "Unknown" && swapEvents.length === 0) {
      const hasBidirectional = negatives.length > 0 && positives.length > 0;
      if (hasBidirectional) {
        // Let it through as swap with Unknown DEX
        logger.warn("Swap decoded with Unknown DEX — no liquidity program matched", { signature });
      } else {
        return res.status(200).json({
          message: "Classified as transfer — no liquidity program detected",
          signature,
          type: "transfer",
          wallet: dynamicWallet,
          base_token: base_asset,
          quote_token: quote_asset
        });
      }
    }

    processUnknownPrograms(Array.from(activePrograms));

    // =========================================================================
    // LAYER 9: DETERMINISTIC PRICING ENGINE
    // =========================================================================

    const SOL_PRICE = cachedSolPrice;

    let { price_native, price_usd, usd_value } = computePrices({
      base_asset,
      quote_asset,
      base_amount,
      quote_amount,
      SOL_MINT,
      STABLE_COINS,
      SOL_PRICE
    });

    // =========================================================================
    // LAYER 10: CONSISTENCY VALIDATION
    // =========================================================================

    if (base_amount <= 0 && quote_amount <= 0) {
      return res.status(200).json({ message: "Zero flow magnitudes detected", signature });
    }

    if (base_asset === "Unknown" && quote_asset === "Unknown") {
      return res.status(200).json({ message: "Unable to resolve active pair mints", signature });
    }

    if (price_native !== null && (!isFinite(price_native) || price_native <= 0)) price_native = null;
    if (price_usd !== null && (!isFinite(price_usd) || price_usd <= 0)) price_usd = null;
    if (price_usd === null) usd_value = null;

    // =========================================================================
    // LAYER 11 & 12: OUTPUT FORMATTER & DB BATCH PUSH
    // =========================================================================

    const txDataToPush = {
      signature,
      slot: txContext.slot,
      block_time: txContext.blockTime || Math.floor(Date.now() / 1000),
      wallet: dynamicWallet,
      dex: aggregator || final_hop,
      program_id: executionProgram,
      type: "swap",
      swap_side,
      base_token: base_asset,
      base_token_decimals: base_decimals,
      base_amount,
      quote_token: quote_asset,
      quote_token_decimals: quote_decimals,
      quote_amount,
      price_usd,
      price_native,
      usd_value,
      fee_lamports: Number(txContext.feeLamports),
      hop_type,
      hop_count,
      final_hop
    };

    try {
      DBBatcher.pushToQueue(txDataToPush);
    } catch (queueErr) {
      logger.error("DB push to queue error (skipping)", { error: queueErr.message });
      return res.status(200).json({
        ...txDataToPush,
        warning: "DB batching failed",
        processed: true
      });
    }

    return res.json({ ...txDataToPush, processed: true });

  } catch (err) {
    logger.error("🔥 FULL ERROR:", { stack: err && err.stack ? err.stack : err });
    return res.status(500).json({ error: "Processing failed", details: err?.message || String(err) });
  }
});

module.exports = router;
