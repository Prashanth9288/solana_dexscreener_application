require("dotenv").config();

if (!process.env.HELIUS_RPC_URL) {
  throw new Error("❌ HELIUS_RPC_URL not set in .env");
}

module.exports = process.env.HELIUS_RPC_URL;