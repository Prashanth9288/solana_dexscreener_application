// src/auth/walletVerifier.js — Solana Wallet Signature Verification
// ─────────────────────────────────────────────────────────────────────────────
// Validates SIWS (Sign-In With Solana) signatures using tweetnacl.
// Includes PublicKey validation to reject malformed addresses.
// ─────────────────────────────────────────────────────────────────────────────

const nacl = require('tweetnacl');
const { PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const logger = require('../utils/logger');

/**
 * Validate that a string is a legitimate Solana public key.
 * Catches whitespace, invalid base58, wrong length, etc.
 */
function isValidSolanaAddress(address) {
  if (!address || typeof address !== 'string') return false;
  const trimmed = address.trim();
  if (trimmed.length === 0 || trimmed !== address) return false; // reject whitespace padding

  try {
    const pk = new PublicKey(trimmed);
    return PublicKey.isOnCurve(pk.toBytes());
  } catch {
    return false;
  }
}

/**
 * Verify a signed message against a Solana wallet address.
 *
 * @param {string} walletAddress  — base58 public key
 * @param {string} signature      — base58-encoded signature
 * @param {string} message        — the original plaintext message that was signed
 * @returns {boolean} true if signature is valid
 */
function verifySignature(walletAddress, signature, message) {
  try {
    if (!isValidSolanaAddress(walletAddress)) {
      logger.warn(`[WalletVerifier] Invalid wallet address: ${walletAddress?.slice(0, 8)}...`);
      return false;
    }

    const publicKeyBytes = new PublicKey(walletAddress).toBytes();
    const messageBytes   = new TextEncoder().encode(message);

    // Handle both base58 and Uint8Array signature formats
    let signatureBytes;
    if (typeof signature === 'string') {
      signatureBytes = bs58.decode(signature);
    } else if (signature instanceof Uint8Array) {
      signatureBytes = signature;
    } else {
      // Try to convert from array-like object
      signatureBytes = new Uint8Array(Object.values(signature));
    }

    if (signatureBytes.length !== 64) {
      logger.warn(`[WalletVerifier] Invalid signature length: ${signatureBytes.length}`);
      return false;
    }

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (err) {
    logger.warn(`[WalletVerifier] Verification error: ${err.message}`);
    return false;
  }
}

module.exports = { verifySignature, isValidSolanaAddress };
