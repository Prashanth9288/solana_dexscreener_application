// src/auth/passportStrategies.js — Google & Twitter OAuth Strategies
// ─────────────────────────────────────────────────────────────────────────────
// Configures Passport.js strategies for Google and Twitter OAuth.
// All credentials read from process.env — NEVER hardcoded.
// ─────────────────────────────────────────────────────────────────────────────

const passport          = require('passport');
const GoogleStrategy    = require('passport-google-oauth20').Strategy;
const TwitterStrategy   = require('passport-twitter').Strategy;
const pool              = require('../config/db');
const logger            = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE OAUTH 2.0
// ═══════════════════════════════════════════════════════════════════════════════

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
      scope:        ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email    = profile.emails?.[0]?.value?.toLowerCase() || null;

        // 1. Check if user exists by google_id
        let { rows } = await pool.query(
          `SELECT * FROM users WHERE google_id = $1`, [googleId]
        );

        if (rows.length > 0) {
          // Existing Google user — update last_login
          await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [rows[0].id]);
          return done(null, rows[0]);
        }

        // 2. Check if user exists by email (link Google to existing email account)
        if (email) {
          ({ rows } = await pool.query(
            `SELECT * FROM users WHERE email = $1`, [email]
          ));

          if (rows.length > 0) {
            // Link Google ID to existing email user
            await pool.query(
              `UPDATE users SET google_id = $1, last_login = NOW() WHERE id = $2`,
              [googleId, rows[0].id]
            );
            rows[0].google_id = googleId;
            logger.info(`[OAuth] Google linked to existing email user: ${email}`);
            return done(null, rows[0]);
          }
        }

        // 3. Create new user
        const { rows: created } = await pool.query(
          `INSERT INTO users (email, google_id, role, created_at, last_login)
           VALUES ($1, $2, 'user', NOW(), NOW())
           RETURNING *`,
          [email, googleId]
        );

        logger.info(`[OAuth] New Google user created: ${email || googleId}`);
        return done(null, created[0]);

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

if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
  passport.use(new TwitterStrategy(
    {
      consumerKey:    process.env.TWITTER_CLIENT_ID,
      consumerSecret: process.env.TWITTER_CLIENT_SECRET,
      callbackURL:    process.env.TWITTER_CALLBACK_URL || '/api/auth/twitter/callback',
      includeEmail:   true,
    },
    async (token, tokenSecret, profile, done) => {
      try {
        const twitterId = profile.id;
        const email     = profile.emails?.[0]?.value?.toLowerCase() || null;

        // 1. Check if user exists by twitter_id
        let { rows } = await pool.query(
          `SELECT * FROM users WHERE twitter_id = $1`, [twitterId]
        );

        if (rows.length > 0) {
          await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [rows[0].id]);
          return done(null, rows[0]);
        }

        // 2. Check if user exists by email (link Twitter to existing)
        if (email) {
          ({ rows } = await pool.query(
            `SELECT * FROM users WHERE email = $1`, [email]
          ));

          if (rows.length > 0) {
            await pool.query(
              `UPDATE users SET twitter_id = $1, last_login = NOW() WHERE id = $2`,
              [twitterId, rows[0].id]
            );
            rows[0].twitter_id = twitterId;
            logger.info(`[OAuth] Twitter linked to existing email user: ${email}`);
            return done(null, rows[0]);
          }
        }

        // 3. Create new user
        const { rows: created } = await pool.query(
          `INSERT INTO users (email, twitter_id, role, created_at, last_login)
           VALUES ($1, $2, 'user', NOW(), NOW())
           RETURNING *`,
          [email, twitterId]
        );

        logger.info(`[OAuth] New Twitter user created: ${email || twitterId}`);
        return done(null, created[0]);

      } catch (err) {
        logger.error(`[OAuth] Twitter strategy error: ${err.message}`);
        return done(err, null);
      }
    }
  ));
  logger.info('[OAuth] Twitter strategy configured');
} else {
  logger.warn('[OAuth] Twitter OAuth not configured — missing TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERIALIZATION (stateless — we use JWT, not sessions)
// ═══════════════════════════════════════════════════════════════════════════════

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
