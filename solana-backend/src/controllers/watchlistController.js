// src/controllers/watchlistController.js — Professional Watchlist Orchestration
// ─────────────────────────────────────────────────────────────────────────────
// Handles multi-folder management, item reordering, pinning, and alerts.
// ─────────────────────────────────────────────────────────────────────────────

const pool = require('../config/db');
const logger = require('../utils/logger');

/**
 * ── FOLDER ACTIONS ────────────────────────────────────────────────────────────
 */

async function getWatchlists(req, res) {
  try {
    const userId = req.user.user_id;
    const { rows } = await pool.query(
      `SELECT id, name, created_at FROM watchlists WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    logger.error(`[Watchlist] getWatchlists error: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch watchlists' });
  }
}

async function createWatchlist(req, res) {
  try {
    const userId = req.user.user_id;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { rows } = await pool.query(
      `INSERT INTO watchlists (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at`,
      [userId, name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error(`[Watchlist] createWatchlist error: ${err.message}`);
    res.status(500).json({ error: 'Failed to create watchlist' });
  }
}

async function deleteWatchlist(req, res) {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;

    const { rowCount } = await pool.query(
      `DELETE FROM watchlists WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (rowCount === 0) return res.status(404).json({ error: 'Watchlist not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error(`[Watchlist] deleteWatchlist error: ${err.message}`);
    res.status(500).json({ error: 'Failed to delete watchlist' });
  }
}

/**
 * ── ITEM ACTIONS ──────────────────────────────────────────────────────────────
 */

const tokenMetadata = require('../services/tokenMetadata');

async function getWatchlistItems(req, res) {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;

    // Verify ownership
    const ownerCheck = await pool.query(`SELECT 1 FROM watchlists WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (ownerCheck.rowCount === 0) return res.status(403).json({ error: 'Unauthorized' });

    // JOIN with pairs table for live metadata (Volume, MCAP, etc.)
    const { rows } = await pool.query(
      `SELECT 
         wi.id, wi.token_address, wi.network, wi.position, wi.pinned, wi.created_at,
         p.price_usd, p.volume_24h, p.txns_24h, p.market_cap, p.liquidity_usd, p.dex,
         p.price_change_24h, p.price_change_1h, p.price_change_5m, p.price_change_6h
       FROM watchlist_items wi
       LEFT JOIN pairs p ON wi.token_address = p.base_token
       WHERE wi.watchlist_id = $1 
       ORDER BY wi.pinned DESC, wi.position ASC, wi.created_at DESC`,
      [id]
    );

    // Enrich with token labels/logos
    const mints = [...new Set(rows.map(r => r.token_address))];
    const meta = mints.length > 0 ? await tokenMetadata.getBatch(mints) : {};
    
    const enriched = rows.map(r => ({
      ...r,
      price_usd: r.price_usd ? parseFloat(r.price_usd) : 0,
      volume_24h: parseFloat(r.volume_24h || 0),
      market_cap: parseFloat(r.market_cap || 0),
      base_token_meta: meta[r.token_address] || null
    }));

    res.json(enriched);
  } catch (err) {
    logger.error(`[Watchlist] getWatchlistItems error: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
}

async function addWatchlistItem(req, res) {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;
    const { token_address, network = 'solana' } = req.body;

    if (!token_address) return res.status(400).json({ error: 'token_address is required' });

    // Verify ownership
    const ownerCheck = await pool.query(`SELECT 1 FROM watchlists WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (ownerCheck.rowCount === 0) return res.status(403).json({ error: 'Unauthorized' });

    // Max position calculation
    const posRes = await pool.query(`SELECT COALESCE(MAX(position), 0) as max_pos FROM watchlist_items WHERE watchlist_id = $1`, [id]);
    const nextPos = (posRes.rows[0].max_pos || 0) + 1;

    const { rows } = await pool.query(
      `INSERT INTO watchlist_items (watchlist_id, token_address, network, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (watchlist_id, token_address) DO NOTHING
       RETURNING *`,
      [id, token_address, network, nextPos]
    );

    if (rows.length === 0) return res.json({ success: true, message: 'Already exists' });
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error(`[Watchlist] addWatchlistItem error: ${err.message}`);
    res.status(500).json({ error: 'Failed to add item' });
  }
}

async function removeWatchlistItem(req, res) {
  try {
    const userId = req.user.user_id;
    const { id, address } = req.params;

    // Verify ownership
    const ownerCheck = await pool.query(`SELECT 1 FROM watchlists WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (ownerCheck.rowCount === 0) return res.status(403).json({ error: 'Unauthorized' });

    await pool.query(
      `DELETE FROM watchlist_items WHERE watchlist_id = $1 AND token_address = $2`,
      [id, address]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error(`[Watchlist] removeWatchlistItem error: ${err.message}`);
    res.status(500).json({ error: 'Failed to remove item' });
  }
}

async function reorderWatchlist(req, res) {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;
    const { items } = req.body; // Array of { token_address, position }

    // Verify ownership
    const ownerCheck = await pool.query(`SELECT 1 FROM watchlists WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (ownerCheck.rowCount === 0) return res.status(403).json({ error: 'Unauthorized' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(
          `UPDATE watchlist_items SET position = $1 WHERE watchlist_id = $2 AND token_address = $3`,
          [item.position, id, item.token_address]
        );
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`[Watchlist] reorder error: ${err.message}`);
    res.status(500).json({ error: 'Failed to reorder' });
  }
}

async function togglePin(req, res) {
  try {
    const userId = req.user.user_id;
    const { id, address } = req.params;
    const { pinned } = req.body;

    // Verify ownership
    const ownerCheck = await pool.query(`SELECT 1 FROM watchlists WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (ownerCheck.rowCount === 0) return res.status(403).json({ error: 'Unauthorized' });

    await pool.query(
      `UPDATE watchlist_items SET pinned = $1 WHERE watchlist_id = $2 AND token_address = $3`,
      [pinned, id, address]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error(`[Watchlist] togglePin error: ${err.message}`);
    res.status(500).json({ error: 'Failed to pin item' });
  }
}

/**
 * ── ALERT ACTIONS ─────────────────────────────────────────────────────────────
 */

async function getAlerts(req, res) {
  try {
    const userId = req.user.user_id;
    const { rows } = await pool.query(`SELECT * FROM watchlist_alerts WHERE user_id = $1`, [userId]);
    res.json(rows);
  } catch (err) {
    logger.error(`[Alerts] getAlerts error: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}

async function createAlert(req, res) {
  try {
    const userId = req.user.user_id;
    const { token_address, price_target, direction } = req.body;

    if (!token_address || !price_target || !direction) {
      return res.status(400).json({ error: 'Missing required alert fields' });
    }

    const { rows } = await pool.query(
      `INSERT INTO watchlist_alerts (user_id, token_address, price_target, direction)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, token_address, price_target, direction]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error(`[Alerts] createAlert error: ${err.message}`);
    res.status(500).json({ error: 'Failed to create alert' });
  }
}

async function deleteAlert(req, res) {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;
    await pool.query(`DELETE FROM watchlist_alerts WHERE id = $1 AND user_id = $2`, [id, userId]);
    res.json({ success: true });
  } catch (err) {
    logger.error(`[Alerts] deleteAlert error: ${err.message}`);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
}

module.exports = {
  getWatchlists,
  createWatchlist,
  deleteWatchlist,
  getWatchlistItems,
  addWatchlistItem,
  removeWatchlistItem,
  reorderWatchlist,
  togglePin,
  getAlerts,
  createAlert,
  deleteAlert,
};

