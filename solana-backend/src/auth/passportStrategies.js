// src/auth/passportStrategies.js — Google & Twitter OAuth Strategies
// ─────────────────────────────────────────────────────────────────────────────
// Configures Passport.js strategies for Google and Twitter OAuth.
// All credentials read from process.env — NEVER hardcoded.
// Uses atomic UPSERT (ON CONFLICT) for race-safe duplicate prevention.
// ─────────────────────────────────────────────────────────────────────────────

const passport          = require('passport');
const GoogleStrategy    = require('passport-google-oauth20').Strategy;
const TwitterStrategy   = require('passport-twitter').Strategy;
const pool              = require('../config/db');
const logger            = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER — Resolve or create user atomically (race-safe under concurrency)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find user by provider ID → find by email → UPSERT new user.
 * Uses ON CONFLICT to prevent duplicate accounts under concurrent load.
 *
 * @param {Object} opts
 * @param {string} opts.providerIdColumn  - 'google_id' or 'twitter_id'
 * @param {string} opts.providerId        - The OAuth provider's user ID
 * @param {string|null} opts.email        - User's email (may be null)
 * @param {string} opts.providerName      - 'Google' or 'Twitter' (for logging)
 * @returns {Object} user row
 */
async function resolveOAuthUser({ providerIdColumn, providerId, email, providerName }) {
  // Step 1: Check if user already exists by provider ID (fast path)
  let { rows } = await pool.query(
    `SELECT * FROM users WHERE ${providerIdColumn} = $1`,
    [providerId]
  );

  if (rows.length > 0) {
    await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [rows[0].id]);
    return rows[0];
  }

  // Step 2: Check if user exists by email — link provider to existing account
  if (email) {
    ({ rows } = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    ));

    if (rows.length > 0) {
      // Link this provider to the existing email-based account
      await pool.query(
        `UPDATE users SET ${providerIdColumn} = $1, last_login = NOW() WHERE id = $2`,
        [providerId, rows[0].id]
      );
      rows[0][providerIdColumn] = providerId;
      logger.info(`[OAuth] ${providerName} linked to existing email user: ${email}`);
      return rows[0];
    }
  }

  // Step 3: Create new user — use UPSERT to handle race conditions
  // If two concurrent requests arrive for the same email, ON CONFLICT ensures
  // only one row is created and the provider ID is linked atomically.
  if (email) {
    const { rows: created } = await pool.query(
      `INSERT INTO users (email, ${providerIdColumn}, role, created_at, last_login)
       VALUES ($1, $2, 'user', NOW(), NOW())
       ON CONFLICT (email)
       DO UPDATE SET ${providerIdColumn} = EXCLUDED.${providerIdColumn}, last_login = NOW()
       RETURNING *`,
      [email, providerId]
    );
    logger.info(`[OAuth] New ${providerName} user created (UPSERT): ${email}`);
    return created[0];
  }

  // Step 4: No email available — insert without conflict guard
  const { rows: created } = await pool.query(
    `INSERT INTO users (email, ${providerIdColumn}, role, created_at, last_login)
     VALUES (NULL, $1, 'user', NOW(), NOW())
     RETURNING *`,
    [providerId]
  );
  logger.info(`[OAuth] New ${providerName} user created (no email): ${providerId}`);
  return created[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE OAUTH 2.0
// ═══════════════════════════════════════════════════════════════════════════════

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL,
      scope:        ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await resolveOAuthUser({
          providerIdColumn: 'google_id',
          providerId:       profile.id,
          email:            profile.emails?.[0]?.value?.toLowerCase() || null,
          providerName:     'Google',
        });
        return done(null, user);
      } catch (err) {
        logger.error(`[OAuth] Google strategy error: ${err.message}`);
        return done(err, null);
      }
    }
  ));
  logger.info('[OAuth] Google strategy configured');
} else {
  logger.warn('[OAuth] Google OAuth not configured — missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TWITTER / X OAUTH 1.0A
// ═══════════════════════════════════════════════════════════════════════════════

if (process.env.TWITTER_CONSUMER_KEY && process.env.TWITTER_CONSUMER_SECRET) {
  passport.use(new TwitterStrategy(
    {
      consumerKey:    process.env.TWITTER_CONSUMER_KEY,
      consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
      callbackURL:    process.env.TWITTER_CALLBACK_URL,
      includeEmail:   true,
    },
    async (token, tokenSecret, profile, done) => {
      try {
        const user = await resolveOAuthUser({
          providerIdColumn: 'twitter_id',
          providerId:       profile.id,
          email:            profile.emails?.[0]?.value?.toLowerCase() || null,
          providerName:     'Twitter',
        });
        return done(null, user);
      } catch (err) {
        logger.error(`[OAuth] Twitter strategy error: ${err.message}`);
        return done(err, null);
      }
    }
  ));
  logger.info('[OAuth] Twitter strategy configured');
} else {
  logger.warn('[OAuth] Twitter OAuth not configured — missing TWITTER_CONSUMER_KEY or TWITTER_CONSUMER_SECRET');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERIALIZATION (needed for OAuth handshake session — not used for API auth)
// ═══════════════════════════════════════════════════════════════════════════════

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
