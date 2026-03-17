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
  const uuid = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000);

  // Safely check if the user exists first to respect Email NOT NULL constraints
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE wallet_address = $1`,
    [walletAddress]
  );

  if (rows.length > 0) {
    // User already exists via OAuth, Email, or prior SIWS link
    await pool.query(
      `UPDATE users SET nonce = $1, nonce_expires = $2 WHERE wallet_address = $3`,
      [uuid, expiresAt, walletAddress]
    );
  } else {
    // Pure Web3 Anonymous Login -> generates a placeholder email mathematically
    const anonymousEmail = `web3_${walletAddress.slice(0,12)}@dex.local`;
    await pool.query(
      `INSERT INTO users (wallet_address, email, role, nonce, nonce_expires, created_at, last_login)
       VALUES ($1, $2, 'user', $3, $4, NOW(), NOW())`,
      [walletAddress, anonymousEmail, uuid, expiresAt]
    );
  }

  return uuid;
}

/**
 * Retrieve and validate a nonce for a wallet.
 * Returns the nonce string if valid, null if expired or missing.
 */
async function consumeNonce(walletAddress) {
  const { rows } = await pool.query(
    `UPDATE users
     SET nonce = NULL, nonce_expires = NULL
     WHERE wallet_address = $1 AND nonce_expires > NOW()
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
      `UPDATE users SET nonce = NULL, nonce_expires = NULL WHERE nonce_expires <= NOW()`
    );
    if (rowCount > 0) {
      logger.debug(`[Nonce] Cleaned up ${rowCount} expired nonces`);
    }
  } catch (err) {
    logger.warn(`[Nonce] Cleanup failed: ${err.message}`);
  }
}

module.exports = { generateNonce, consumeNonce, cleanupExpiredNonces };
