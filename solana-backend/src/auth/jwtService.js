// src/auth/jwtService.js — Dual Token JWT Service
// ─────────────────────────────────────────────────────────────────────────────
// Access token:  15 minutes (short-lived, used for API calls)
// Refresh token: 7 days     (long-lived, stored in auth_sessions table)
// ─────────────────────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET         = process.env.JWT_SECRET         || 'dev-jwt-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';
const ACCESS_EXPIRY      = '15m';
const REFRESH_EXPIRY     = '7d';

/**
 * Generate an access token (short-lived, for API requests)
 */
function signAccessToken(payload) {
  return jwt.sign(
    { user_id: payload.user_id, wallet_address: payload.wallet_address, email: payload.email, role: payload.role },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

/**
 * Generate a refresh token (long-lived, for session renewal)
 */
function signRefreshToken(payload) {
  return jwt.sign(
    { user_id: payload.user_id, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );
}

/**
 * Verify an access token — returns decoded payload or null
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name !== 'TokenExpiredError') {
      logger.warn(`[JWT] Access token verification failed: ${err.message}`);
    }
    return null;
  }
}

/**
 * Verify a refresh token — returns decoded payload or null
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (err) {
    logger.warn(`[JWT] Refresh token verification failed: ${err.message}`);
    return null;
  }
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  ACCESS_EXPIRY,
  REFRESH_EXPIRY,
};
