require("dotenv").config();

const HELIUS_RPC = process.env.HELIUS_RPC_URL;
const FALLBACK_RPC = process.env.FALLBACK_RPC_URL || "https://api.mainnet-beta.solana.com";

const RPC_ENDPOINTS = [HELIUS_RPC].filter(Boolean);
if (FALLBACK_RPC) RPC_ENDPOINTS.push(FALLBACK_RPC);

if (RPC_ENDPOINTS.length === 0) {
  console.warn("⚠️  No RPC URL set — RPC calls will fail until this env var is configured.");
}

module.exports = RPC_ENDPOINTS;