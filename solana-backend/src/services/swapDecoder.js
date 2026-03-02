const SOL_MINT = "So11111111111111111111111111111111111111112";
const DEX_REGISTRY = require("./dexRegistry");

function uiAmount(raw, decimals) {
  return Number(raw) / Math.pow(10, decimals);
}

function detectDex(tx) {
  const programs = new Set();

  const message = tx.transaction.message;
  const inner = tx.meta?.innerInstructions || [];
  const loaded = tx.meta?.loadedAddresses || {};

  const allPrograms = [
    ...(message.instructions || []).map(i => i.programId),
    ...inner.flatMap(g => g.instructions.map(i => i.programId)),
    ...(loaded.readonly || []),
    ...(loaded.writable || [])
  ];

  for (const p of allPrograms) {
    if (DEX_REGISTRY[p]) {
      programs.add(p);
    }
  }

  if (!programs.size) return null;

  const first = [...programs][0];
  return {
    program_id: first,
    dex: DEX_REGISTRY[first].dex,
    dex_source: DEX_REGISTRY[first].source,
    hop_type: programs.size > 1 ? "multi" : "single"
  };
}

function extractSwap(tx) {
  const wallet =
    tx.transaction.message.accountKeys.find(k => k.signer)?.pubkey ||
    tx.transaction.message.accountKeys[0]?.pubkey;

  const walletIndex =
    tx.transaction.message.accountKeys.findIndex(k => k.pubkey === wallet);

  const preToken = tx.meta?.preTokenBalances || [];
  const postToken = tx.meta?.postTokenBalances || [];
  const preLamports = tx.meta?.preBalances || [];
  const postLamports = tx.meta?.postBalances || [];

  const changes = [];

  // SPL tokens
  for (const pre of preToken) {
    if (pre.owner !== wallet) continue;

    const post = postToken.find(
      p => p.accountIndex === pre.accountIndex
    );

    const before = BigInt(pre.uiTokenAmount.amount);
    const after = post ? BigInt(post.uiTokenAmount.amount) : 0n;

    const diff = after - before;

    if (diff !== 0n) {
      changes.push({
        mint: pre.mint,
        decimals: pre.uiTokenAmount.decimals,
        diff
      });
    }
  }

  // SOL
  if (walletIndex !== -1) {
    const diff =
      BigInt(postLamports[walletIndex]) -
      BigInt(preLamports[walletIndex]);

    const MIN_LAMPORT_SWAP = 10000n;
    if (diff !== 0n && (diff > MIN_LAMPORT_SWAP || diff < -MIN_LAMPORT_SWAP)) {
      changes.push({
        mint: SOL_MINT,
        decimals: 9,
        diff
      });
    }
  }

  if (!changes.length) return null;

  const deltaMap = new Map();
  for (const c of changes) {
    if (!deltaMap.has(c.mint)) deltaMap.set(c.mint, { mint: c.mint, decimals: c.decimals, diff: 0n });
    deltaMap.get(c.mint).diff += c.diff;
  }

  const aggregatedChanges = Array.from(deltaMap.values()).filter(c => c.diff !== 0n);
  if (!aggregatedChanges.length) return null;

  const negatives = aggregatedChanges.filter(c => c.diff < 0n);
  const positives = aggregatedChanges.filter(c => c.diff > 0n);

  if (!negatives.length || !positives.length) return null;

  negatives.sort((a, b) => {
    const absA = a.diff < 0n ? -a.diff : a.diff;
    const absB = b.diff < 0n ? -b.diff : b.diff;
    return absB > absA ? 1 : absB < absA ? -1 : 0;
  });
  positives.sort((a, b) => (b.diff > a.diff ? 1 : b.diff < a.diff ? -1 : 0));

  const inToken = negatives[0];
  const outToken = positives[0];

  const amountIn = uiAmount(-inToken.diff, inToken.decimals);
  const amountOut = uiAmount(outToken.diff, outToken.decimals);

  return {
    wallet,
    token_in: inToken.mint,
    token_in_decimals: inToken.decimals,
    amount_in: amountIn,
    token_out: outToken.mint,
    token_out_decimals: outToken.decimals,
    amount_out: amountOut,
    price: amountOut / amountIn
  };
}

module.exports = { detectDex, extractSwap };