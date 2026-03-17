// src/routes/watchlistRoutes.js — Professional Watchlist Routes
// ─────────────────────────────────────────────────────────────────────────────
// CRUD for multi-folders, items, reordering, and pinning.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { requireAuth } = require('../auth/authMiddleware');
const watchlistController = require('../controllers/watchlistController');

const router = express.Router();

/**
 * ── FOLDERS ──
 */
router.get('/', requireAuth, watchlistController.getWatchlists);
router.post('/', requireAuth, watchlistController.createWatchlist);
router.delete('/:id', requireAuth, watchlistController.deleteWatchlist);

/**
 * ── ITEMS ──
 */
router.get('/:id/items', requireAuth, watchlistController.getWatchlistItems);
router.post('/:id/items', requireAuth, watchlistController.addWatchlistItem);
router.delete('/:id/items/:address', requireAuth, watchlistController.removeWatchlistItem);

/**
 * ── PREFERENCES ──
 */
router.put('/:id/reorder', requireAuth, watchlistController.reorderWatchlist);
router.put('/:id/pin/:address', requireAuth, watchlistController.togglePin);

/**
 * ── ALERTS ──
 */
router.get('/alerts/all', requireAuth, watchlistController.getAlerts);
router.post('/alerts', requireAuth, watchlistController.createAlert);
router.delete('/alerts/:id', requireAuth, watchlistController.deleteAlert);

module.exports = router;

