// src/auth/authController.js — Authentication Endpoints
// ─────────────────────────────────────────────────────────────────────────────
// Handles:
//   GET  /nonce         — generate wallet challenge
//   POST /verify-wallet — verify SIWS signature → issue tokens
//   POST /register      — email/password registration
//   POST /login         — email/password login
//   POST /link-wallet   — attach wallet to existing account (JWT protected)
//   POST /refresh       — exchange refresh token for new access token
//   GET  /me            — return current user profile (JWT protected)
//   POST /logout        — invalidate refresh token
// ─────────────────────────────────────────────────────────────────────────────

const bcrypt = require('bcryptjs');
const pool   = require('../config/db');
const logger = require('../utils/logger');

const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('./jwtService');
const { generateNonce, consumeNonce }                           = require('./nonceService');
const { verifySignature, isValidSolanaAddress }                 = require('./walletVerifier');

const BCRYPT_ROUNDS = 12;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER — create token pair + store refresh session
// ═══════════════════════════════════════════════════════════════════════════════

async function issueTokenPair(user) {
  const payload = {
    user_id:        user.id,
    wallet_address: user.wallet_address,
    email:          user.email,
    role:           user.role || 'user',
  };

  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store refresh token in auth_sessions (7 day expiry)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_sessions (user_id, refresh_token, expires_at, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [user.id, refreshToken, expiresAt]
  );

  return {
    access_token:  accessToken,
    refresh_token: refreshToken,
    user: {
      id:             user.id,
      email:          user.email,
      wallet_address: user.wallet_address,
      role:           user.role || 'user',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /nonce?wallet=<address>
// ═══════════════════════════════════════════════════════════════════════════════

async function getNonce(req, res) {
  try {
    const wallet = req.query.wallet;

    if (!wallet || !isValidSolanaAddress(wallet)) {
      return res.status(400).json({ error: 'Valid Solana wallet address is required' });
    }

    const nonce = await generateNonce(wallet);

    // Build human-readable SIWS message
    const message = `Sign in to Solana DEX Terminal\n\nWallet: ${wallet}\nNonce: ${nonce}\n\nThis request will not trigger a blockchain transaction or cost any gas fees.`;

    res.json({ nonce, message });
  } catch (err) {
    logger.error(`[Auth] getNonce error: ${err.message}`);
    res.status(500).json({ error: 'Failed to generate nonce' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /verify-wallet
// ═══════════════════════════════════════════════════════════════════════════════

async function verifyWallet(req, res) {
  try {
    const { walletAddress, signature, message } = req.body;

    if (!walletAddress || !signature || !message) {
      return res.status(400).json({ error: 'walletAddress, signature, and message are required' });
    }

    if (!isValidSolanaAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }

    // 1. Consume the nonce (atomic — deletes it so it can't be reused)
    const storedNonce = await consumeNonce(walletAddress);
    if (!storedNonce) {
      return res.status(401).json({ error: 'Nonce expired or not found — request a new one' });
    }

    // 2. Verify the message contains the correct nonce
    if (!message.includes(storedNonce)) {
      return res.status(401).json({ error: 'Message does not contain the expected nonce' });
    }

    // 3. Verify signature using tweetnacl
    const isValid = verifySignature(walletAddress, signature, message);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 4. Find user (already UPSERTED by generateNonce)
    let user;
    const { rows: existing } = await pool.query(
      `SELECT * FROM users WHERE wallet_address = $1`,
      [walletAddress]
    );

    if (existing.length > 0) {
      user = existing[0];
      // Update last_login
      await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);
    } else {
      return res.status(401).json({ error: 'User record missing during verification' });
    }

    // 5. Issue token pair
    const tokens = await issueTokenPair(user);
    logger.info(`[Auth] Wallet login: ${walletAddress.slice(0, 8)}... (user_id: ${user.id})`);
    res.json(tokens);

  } catch (err) {
    logger.error(`[Auth] verifyWallet error: ${err.message}`);
    res.status(500).json({ error: 'Wallet verification failed' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /register
// ═══════════════════════════════════════════════════════════════════════════════

async function register(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already exists
    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE email = $1`, [email.toLowerCase()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password with bcrypt 12 rounds
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user
    const { rows: created } = await pool.query(
      `INSERT INTO users (email, password_hash, role, created_at, last_login)
       VALUES ($1, $2, 'user', NOW(), NOW())
       RETURNING *`,
      [email.toLowerCase(), passwordHash]
    );

    const user = created[0];
    const tokens = await issueTokenPair(user);
    logger.info(`[Auth] Email registration: ${email}`);
    res.status(201).json(tokens);

  } catch (err) {
    logger.error(`[Auth] register error: ${err.message}`);
    res.status(500).json({ error: 'Registration failed' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /login
// ═══════════════════════════════════════════════════════════════════════════════

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await pool.query(
      `SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];

    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account uses wallet or social login — no password set' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last_login
    await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

    const tokens = await issueTokenPair(user);
    logger.info(`[Auth] Email login: ${email}`);
    res.json(tokens);

  } catch (err) {
    logger.error(`[Auth] login error: ${err.message}`);
    res.status(500).json({ error: 'Login failed' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /link-wallet (JWT protected)
// ═══════════════════════════════════════════════════════════════════════════════

async function linkWallet(req, res) {
  try {
    const { walletAddress, signature, message } = req.body;
    const userId = req.user.user_id;

    if (!walletAddress || !signature || !message) {
      return res.status(400).json({ error: 'walletAddress, signature, and message are required' });
    }

    if (!isValidSolanaAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }

    // Verify the signature to prove wallet ownership
    const isValid = verifySignature(walletAddress, signature, message);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid wallet signature' });
    }

    // Check if wallet is already linked to another account
    const { rows: conflict } = await pool.query(
      `SELECT id FROM users WHERE wallet_address = $1 AND id != $2`,
      [walletAddress, userId]
    );
    if (conflict.length > 0) {
      return res.status(409).json({ error: 'This wallet is already linked to another account' });
    }

    // Link wallet to current user
    await pool.query(
      `UPDATE users SET wallet_address = $1 WHERE id = $2`,
      [walletAddress, userId]
    );

    logger.info(`[Auth] Wallet linked: ${walletAddress.slice(0, 8)}... → user_id: ${userId}`);
    res.json({ success: true, wallet_address: walletAddress });

  } catch (err) {
    logger.error(`[Auth] linkWallet error: ${err.message}`);
    res.status(500).json({ error: 'Failed to link wallet' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /refresh
// ═══════════════════════════════════════════════════════════════════════════════

async function refreshToken(req, res) {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token is required' });
    }

    // Verify the refresh token cryptographically
    const decoded = verifyRefreshToken(refresh_token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Verify it exists in auth_sessions (not invalidated)
    const { rows: sessions } = await pool.query(
      `SELECT * FROM auth_sessions
       WHERE user_id = $1 AND refresh_token = $2 AND expires_at > NOW()`,
      [decoded.user_id, refresh_token]
    );

    if (sessions.length === 0) {
      return res.status(401).json({ error: 'Refresh token has been revoked' });
    }

    // Get current user data
    const { rows: users } = await pool.query(`SELECT * FROM users WHERE id = $1`, [decoded.user_id]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Delete old refresh session
    await pool.query(
      `DELETE FROM auth_sessions WHERE user_id = $1 AND refresh_token = $2`,
      [decoded.user_id, refresh_token]
    );

    // Issue new token pair (rotate refresh token)
    const tokens = await issueTokenPair(users[0]);
    res.json(tokens);

  } catch (err) {
    logger.error(`[Auth] refreshToken error: ${err.message}`);
    res.status(500).json({ error: 'Token refresh failed' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /me (JWT protected)
// ═══════════════════════════════════════════════════════════════════════════════

async function getMe(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, wallet_address, google_id, twitter_id, role, created_at, last_login
       FROM users WHERE id = $1`,
      [req.user.user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    logger.error(`[Auth] getMe error: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /logout
// ═══════════════════════════════════════════════════════════════════════════════

async function logout(req, res) {
  try {
    const { refresh_token } = req.body;

    // 1. Delete specific refresh token session if provided
    if (refresh_token) {
      await pool.query(
        `DELETE FROM auth_sessions WHERE refresh_token = $1`,
        [refresh_token]
      );
    }

    // 2. If JWT is present (via optionalAuth middleware), clear all sessions for that user
    // This serves as a secondary sweep to guarantee rogue sessions are destroyed
    if (req.user && req.user.user_id) {
       await pool.query(`DELETE FROM auth_sessions WHERE user_id = $1`, [req.user.user_id]);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(`[Auth] logout error: ${err.message}`);
    // Don't leak 500s on logout — frontends don't need to block UI if DB fails to drop session
    res.json({ success: true }); 
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OAuth Callback Handler (used after Google/Twitter Passport authentication)
// ═══════════════════════════════════════════════════════════════════════════════

async function oauthCallback(req, res) {
  try {
    // Passport attaches the authenticated user to req.user
    const user = req.user;
    if (!user || !user.id) {
      logger.warn('[Auth] OAuth callback — no user on request');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/market?auth_error=oauth_failed`);
    }

    // Issue JWT token pair
    const tokens = await issueTokenPair(user);
    const provider = user.google_id ? 'google' : user.twitter_id ? 'twitter' : 'oauth';
    logger.info(`[Auth] OAuth ${provider} login: user_id=${user.id}`);

    // Redirect to frontend with tokens in URL fragment (hash)
    // Fragment (#) is never sent to the server, making it safer than query params
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const params = new URLSearchParams({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      user_id:       String(user.id),
      email:         user.email || '',
      provider,
    });

    res.redirect(`${frontendUrl}/auth/callback#${params.toString()}`);
  } catch (err) {
    logger.error(`[Auth] oauthCallback error: ${err.message}`);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/market?auth_error=server_error`);
  }
}

module.exports = {
  getNonce,
  verifyWallet,
  register,
  login,
  linkWallet,
  refreshToken,
  getMe,
  logout,
  oauthCallback,
};
