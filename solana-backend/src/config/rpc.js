require("dotenv").config();

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;

if (!HELIUS_RPC_URL) {
  console.warn("⚠️  HELIUS_RPC_URL not set — RPC calls will fail until this env var is configured.");
}

module.exports = HELIUS_RPC_URL || '';