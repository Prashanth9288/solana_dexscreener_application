// src/routes/webhookRoutes.js
// Helius Enhanced Webhook listener — production-hardened.
//
// Key design principles:
//   1. Respond 200 immediately (Helius requires < 5s response time).
//   2. Decode signatures through a CONCURRENCY-LIMITED internal queue (max 3 at a time).
//      This prevents the thundering-herd that trips the RPC circuit breaker.
//   3. Validate authorization header (set WEBHOOK_SECRET in Render env vars).

const express = require('express');
const logger  = require('../utils/logger');
const router  = express.Router();

// ── Concurrency-limited async queue ──────────────────────────────────────────
// Processes decode jobs at most CONCURRENCY at a time.
// Prevents hammering the RPC when Helius sends a batch of 100+ transactions.
const CONCURRENCY = 3;     // max parallel decode calls
const QUEUE_CAP   = 5000;  // drop oldest when queue overflows

const pendingJobs = [];
let activeWorkers = 0;

function enqueue(signature) {
  if (pendingJobs.length >= QUEUE_CAP) {
    logger.warn(`Webhook queue full (${QUEUE_CAP}) — dropping oldest job`);
    pendingJobs.shift();
  }
  pendingJobs.push(signature);
  drainQueue();
}

function drainQueue() {
  while (activeWorkers < CONCURRENCY && pendingJobs.length > 0) {
    const signature = pendingJobs.shift();
    activeWorkers++;
    decodeAndStore(signature).finally(() => {
      activeWorkers--;
      drainQueue(); // pick up next job when a slot frees
    });
  }
}

// ── Internal decode call ──────────────────────────────────────────────────────
// Routes each signature through the existing /transaction decode pipeline.
// Using a local HTTP call keeps the 12-layer decode logic in one canonical place.
async function decodeAndStore(signature) {
  try {
    const port = process.env.PORT || 5000;
    const internalUrl = `http://127.0.0.1:${port}/transaction`;

    const res = await fetch(internalUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ signature }),
      signal:  AbortSignal.timeout(20000), // longer timeout for RPC retries
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn(`Webhook decode failed for ${signature}: HTTP ${res.status} — ${body.slice(0, 200)}`);
      return;
    }

    const data = await res.json();
    if (data?.processed) {
      logger.info(`Webhook: decoded swap`, { sig: signature.slice(0, 16) + '...', dex: data.dex });
    } else {
      logger.info(`Webhook: non-swap tx`, { sig: signature.slice(0, 16) + '...', msg: data.message });
    }
  } catch (err) {
    logger.error(`Webhook decode error for ${signature}: ${err.message}`);
  }
}

// ── POST /webhook/helius ──────────────────────────────────────────────────────
router.post('/helius', async (req, res) => {
  // 1. Validate secret header.
  //    Helius sends the secret in the "authorization" header as a raw string.
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const authHeader = req.headers['authorization'] || '';
    const provided =
      req.headers['x-webhook-secret'] ||
      authHeader.replace(/^Bearer\s+/i, '') ||
      authHeader ||
      '';

    if (provided !== secret) {
      logger.warn('Webhook: rejected — invalid secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // 2. Validate payload shape.
  const events = Array.isArray(req.body) ? req.body : [req.body];
  if (events.length === 0) {
    return res.status(400).json({ error: 'Empty payload' });
  }

  // 3. Respond immediately — Helius won't wait beyond 5s.
  res.status(200).json({
    received: events.length,
    queued:   events.length,
    workers:  activeWorkers,
    backlog:  pendingJobs.length,
    status:   'queued',
  });

  // 4. Extract signatures → push to rate-limited queue (never fires 100 at once).
  let queued = 0;
  for (const event of events) {
    const signature =
      event.signature                        ||
      event.transaction?.signatures?.[0]     ||
      event.txnSignature                     ||
      null;

    if (!signature) {
      logger.warn('Webhook event missing signature', { keys: Object.keys(event).slice(0, 10) });
      continue;
    }
    enqueue(signature);
    queued++;
  }

  if (queued > 0) {
    logger.info(`Webhook: queued ${queued} signatures (active workers: ${activeWorkers}, backlog: ${pendingJobs.length})`);
  }
});

module.exports = router;
