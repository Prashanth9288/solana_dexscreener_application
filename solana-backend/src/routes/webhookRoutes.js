// src/routes/webhookRoutes.js
// Helius Enhanced Webhook listener.
// Helius sends POST requests to this endpoint with parsed transaction data.
//
// Setup in Helius dashboard:
//   Webhook URL: https://<your-render-url>/webhook/helius
//   Secret:      Set WEBHOOK_SECRET env var in Render; paste same value in Helius dashboard.
//
// Helius payload format: Array of enhanced transaction objects.
// Docs: https://docs.helius.dev/webhooks-and-websockets/enhanced-transactions-api/webhooks

const express = require('express');
const { fetchWithRetry } = require('../utils/rpcClient');
const logger  = require('../utils/logger');
const DBBatcher = require('../services/dbBatcher');

const router = express.Router();

// ── Shared decode pipeline (mirrors transactionRoutes.js core logic) ──────────
// We re-use the same route handler by forwarding to an internal HTTP call.
// This avoids duplicating 700+ lines — the decode POST /transaction is canonical.
// We call it via a lightweight internal fetch against localhost.
async function decodeAndStore(signature) {
  try {
    const port = process.env.PORT || 5000;
    const internalUrl = `http://127.0.0.1:${port}/transaction`;

    const res = await fetch(internalUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ signature }),
      signal:  AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn(`Webhook decode failed for ${signature}: HTTP ${res.status} — ${body.slice(0, 200)}`);
      return;
    }

    const data = await res.json();
    if (data && data.processed) {
      logger.info(`Webhook: decoded swap for ${signature}`, { dex: data.dex, wallet: data.wallet });
    } else {
      logger.info(`Webhook: non-swap tx ${signature}`, { message: data.message });
    }
  } catch (err) {
    logger.error(`Webhook decode error for ${signature}: ${err.message}`);
  }
}

// ── POST /webhook/helius ──────────────────────────────────────────────────────
router.post('/helius', async (req, res) => {
  // 1. Validate secret header (optional but strongly recommended)
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers['x-webhook-secret'] ||
                     req.headers['authorization']?.replace('Bearer ', '');
    if (provided !== secret) {
      logger.warn('Webhook: rejected request — invalid secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // 2. Validate payload shape
  const events = Array.isArray(req.body) ? req.body : [req.body];
  if (events.length === 0) {
    return res.status(400).json({ error: 'Empty payload' });
  }

  // 3. Respond immediately — Helius requires a fast 200 OK
  //    Decoding happens asynchronously; Helius won't wait for it.
  res.status(200).json({ received: events.length, status: 'queued' });

  // 4. Extract signatures and fire async decode pipeline
  for (const event of events) {
    const signature =
      event.signature      ||   // Standard Helius enhanced tx
      event.transaction?.signatures?.[0] ||  // Raw transaction format
      event.txnSignature   ||   // Some legacy formats
      null;

    if (!signature) {
      logger.warn('Webhook event missing signature', { keys: Object.keys(event) });
      continue;
    }

    // Rate-limit: stagger decodes by 200ms to not hammer the RPC
    const delay = events.indexOf(event) * 200;
    setTimeout(() => decodeAndStore(signature), delay);
  }
});

module.exports = router;
