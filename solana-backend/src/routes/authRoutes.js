// src/routes/authRoutes.js — Authentication Routes with Rate Limiting
// ─────────────────────────────────────────────────────────────────────────────
// All auth endpoints are grouped under /api/auth/*
// Rate limiting applied to sensitive endpoints to prevent brute force.
// Includes Google and Twitter OAuth via Passport.js
// ─────────────────────────────────────────────────────────────────────────────

const express  = require('express');
const rateLimit = require('express-rate-limit');
const passport  = require('../auth/passportStrategies');
const { requireAuth, optionalAuth } = require('../auth/authMiddleware');
const auth = require('../auth/authController');

const router = express.Router();

// ── Rate Limiters ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10,             // 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests — please try again in a minute' },
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,              // 5 requests per minute for login/register
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — please wait before trying again' },
});

// ── Wallet + Email Routes ────────────────────────────────────────────────────
router.get('/nonce',          authLimiter,   auth.getNonce);
router.post('/verify-wallet', authLimiter,   auth.verifyWallet);
router.post('/register',      strictLimiter, auth.register);
router.post('/login',         strictLimiter, auth.login);
router.post('/refresh',       authLimiter,   auth.refreshToken);

// ── Google OAuth Routes ──────────────────────────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/market?auth_error=google_failed' }),
  auth.oauthCallback
);

// ── Twitter/X OAuth Routes ───────────────────────────────────────────────────
router.get('/twitter',
  passport.authenticate('twitter', { session: false })
);

router.get('/twitter/callback',
  passport.authenticate('twitter', { session: false, failureRedirect: '/market?auth_error=twitter_failed' }),
  auth.oauthCallback
);

// ── Protected Routes ─────────────────────────────────────────────────────────
router.post('/link-wallet',   requireAuth, auth.linkWallet);
router.get('/me',             requireAuth, auth.getMe);
router.post('/logout',        optionalAuth, auth.logout);

module.exports = router;

