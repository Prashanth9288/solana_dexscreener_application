// src/auth/nonceService.js — Wallet Nonce Challenge Service
// ─────────────────────────────────────────────────────────────────────────────
// Generates time-limited nonces for Sign-In With Solana (SIWS).
// Nonces expire after 5 minutes to prevent replay attacks.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const pool   = require('../config/db');
const logger = require('../utils/logger');

const NONCE_TTL_MINUTES = 5;

/**
 * Generate and store a nonce for a wallet address.
 * Uses UPSERT so repeated requests just refresh the nonce.
 */
async function generateNonce(walletAddress) {
  const nonce     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000);

  await pool.query(
    `INSERT INTO wallet_nonces (wallet_address, nonce, expires_at, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (wallet_address)
     DO UPDATE SET nonce = $2, expires_at = $3, created_at = NOW()`,
    [walletAddress, nonce, expiresAt]
  );

  return nonce;
}

/**
 * Retrieve and validate a nonce for a wallet.
 * Returns the nonce string if valid, null if expired or missing.
 */
async function consumeNonce(walletAddress) {
  const { rows } = await pool.query(
    `DELETE FROM wallet_nonces
     WHERE wallet_address = $1 AND expires_at > NOW()
     RETURNING nonce`,
    [walletAddress]
  );

  if (rows.length === 0) {
    logger.warn(`[Nonce] No valid nonce found for wallet ${walletAddress.slice(0, 8)}...`);
    return null;
  }

  return rows[0].nonce;
}

/**
 * Cleanup expired nonces (called periodically or on startup)
 */
async function cleanupExpiredNonces() {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM wallet_nonces WHERE expires_at <= NOW()`
    );
    if (rowCount > 0) {
      logger.debug(`[Nonce] Cleaned up ${rowCount} expired nonces`);
    }
  } catch (err) {
    logger.warn(`[Nonce] Cleanup failed: ${err.message}`);
  }
}

module.exports = { generateNonce, consumeNonce, cleanupExpiredNonces };
