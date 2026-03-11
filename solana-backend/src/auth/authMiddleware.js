// src/auth/authMiddleware.js — JWT Authentication Middleware
// ─────────────────────────────────────────────────────────────────────────────
// Extracts Bearer token from Authorization header, verifies it,
// and attaches decoded user to req.user. Returns 401 on failure.
// ─────────────────────────────────────────────────────────────────────────────

const { verifyAccessToken } = require('./jwtService');

/**
 * Protect routes — requires valid access token.
 * Attaches { user_id, wallet_address, email, role } to req.user
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token   = authHeader.slice(7); // strip "Bearer "
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

/**
 * Optional auth — attaches user if token is present, but does not reject.
 * Useful for endpoints that behave differently for authenticated users.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token   = authHeader.slice(7);
    const decoded = verifyAccessToken(token);
    if (decoded) req.user = decoded;
  }

  next();
}

module.exports = { requireAuth, optionalAuth };
