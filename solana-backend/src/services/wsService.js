/**
 * wsService.js — Production WebSocket + Redis Pub/Sub Broadcaster
 *
 * Architecture:
 *   - Frontend sends: { action: 'subscribe', channel: 'trades:<mint_address>' }
 *   - Server subscribes to Redis on first client per channel. Multiple clients → single Redis sub.
 *   - Redis delivers payload → server routes only to subscribing clients.
 *   - Dead socket detection via 30s ping/pong heartbeat.
 *   - On disconnect: channel map cleaned up. Last subscriber → Redis auto-unsubscribe.
 *   - Falls back to monolithic broadcast if Redis is not configured.
 */

const { WebSocketServer, WebSocket } = require('ws');
const { getSubscriber } = require('../config/redisClient');
const logger = require('../utils/logger');

let wss = null;

// channel -> Set<WebSocket> — routes Redis channel to subscribing clients
const channelClients = new Map();

// WebSocket -> Set<string> — tracks channels each connected client has subscribed to
const clientChannels = new Map();

// Heartbeat constants
const HEARTBEAT_INTERVAL_MS = 30_000; // 30s ping interval
const HEARTBEAT_TIMEOUT_MS  = 10_000; // 10s before declaring a socket dead

let redisSubscriberBound = false;
let heartbeatTimer = null;

// ─── CHANNEL VALIDATION ─────────────────────────────────────────────────────
// Prevent clients from subscribing to arbitrary internal Redis keys.
const VALID_CHANNEL_PREFIX = /^trades:[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidChannel(channel) {
  return typeof channel === 'string' && VALID_CHANNEL_PREFIX.test(channel);
}

// ─── REDIS SUBSCRIBER BINDING ────────────────────────────────────────────────
// Called on attach() and lazily when the Redis subscriber reconnects.
function bindRedisSubscriber() {
  const sub = getSubscriber();
  if (!sub || redisSubscriberBound) return;
  redisSubscriberBound = true;

  sub.on('message', (channel, message) => {
    const subscribers = channelClients.get(channel);
    if (!subscribers || subscribers.size === 0) return;

    let sent = 0;
    let failed = 0;
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message); // message is pre-serialized JSON from the publisher
          sent++;
        } catch (err) {
          logger.warn(`[WS/Redis] send error on channel=${channel}: ${err.message}`);
          failed++;
        }
      }
    }
    if (sent > 0) logger.debug(`[WS/Redis] channel=${channel} → ${sent} clients sent, ${failed} failed`);
  });

  // If the subscriber reconnects, it loses all Redis subscriptions — re-subscribe all
  sub.on('ready', () => {
    const channels = [...channelClients.keys()];
    if (channels.length > 0) {
      logger.info(`[WS/Redis] Subscriber reconnected — re-subscribing ${channels.length} channel(s)`);
      sub.subscribe(...channels).catch(err =>
        logger.error(`[WS/Redis] Re-subscribe failed: ${err.message}`)
      );
    }
  });

  sub.on('error', (err) => {
    logger.warn(`[WS/Redis] Subscriber error: ${err.message}`);
    // On reconnect, the 'ready' event will re-subscribe channels
  });
}

// ─── CHANNEL SUBSCRIPTION ────────────────────────────────────────────────────
function subscribeClientToChannel(ws, channel) {
  if (!isValidChannel(channel)) {
    logger.warn(`[WS] Rejected invalid channel subscription: "${channel}"`);
    safeSend(ws, { type: 'error', message: `Invalid channel: ${channel}` });
    return;
  }

  const sub = getSubscriber();

  if (!channelClients.has(channel)) {
    channelClients.set(channel, new Set());
    // First subscriber — tell Redis to begin delivering messages for this channel
    if (sub) {
      sub.subscribe(channel, (err) => {
        if (err) logger.warn(`[WS/Redis] subscribe failed: ${channel}: ${err.message}`);
        else     logger.debug(`[WS/Redis] Redis SUBSCRIBE → ${channel}`);
      });
    }
  }

  channelClients.get(channel).add(ws);

  if (!clientChannels.has(ws)) clientChannels.set(ws, new Set());
  clientChannels.get(ws).add(channel);

  safeSend(ws, { type: 'subscribed', channel });
}

// ─── CLIENT CLEANUP ──────────────────────────────────────────────────────────
function cleanupClient(ws) {
  const channels = clientChannels.get(ws);
  if (!channels) return;

  const sub = getSubscriber();

  for (const channel of channels) {
    const subs = channelClients.get(channel);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) {
        channelClients.delete(channel);
        if (sub) {
          sub.unsubscribe(channel).catch(() => {});
          logger.debug(`[WS/Redis] Redis UNSUBSCRIBE → ${channel} (no listeners remaining)`);
        }
      }
    }
  }

  clientChannels.delete(ws);
}

// ─── HEARTBEAT (DEAD SOCKET DETECTION) ──────────────────────────────────────
// The browser's TCP stack can keep a socket open even after the user closes
// the tab. Without a heartbeat, dead sockets accumulate in channelClients.
function startHeartbeat() {
  heartbeatTimer = setInterval(() => {
    if (!wss) return;
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        // Socket failed to respond to last ping → terminate
        logger.warn('[WS/Heartbeat] Dead socket detected — terminating');
        cleanupClient(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  if (heartbeatTimer.unref) heartbeatTimer.unref(); // Don't prevent Node process exit
}

// ─── ATTACH ──────────────────────────────────────────────────────────────────
function attach(httpServer) {
  wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    // Reject messages > 64KB to prevent heap bombs
    maxPayload: 64 * 1024,
  });

  bindRedisSubscriber();
  startHeartbeat();

  logger.info('[WS] WebSocket server attached on /ws');

  wss.on('connection', (socket, req) => {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    logger.info(`[WS] Connected: ${ip} (total: ${wss.clients.size})`);

    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; }); // Heartbeat response

    // Welcome packet for frontend connection detection
    safeSend(socket, { type: 'connected', message: 'Solana DEX Terminal WebSocket ready' });

    socket.on('message', (raw) => {
      // Guard: raw must be a string/Buffer, max 1KB
      if (Buffer.byteLength(raw) > 1024) {
        logger.warn(`[WS] Oversized message from ${ip} — ignoring`);
        return;
      }
      try {
        const msg = JSON.parse(raw.toString());

        // Production handshake: { action: 'subscribe', channel: 'trades:MINT' }
        if (msg.action === 'subscribe' && msg.channel) {
          subscribeClientToChannel(socket, msg.channel);
          return;
        }
        // Legacy compatibility
        if (msg.type === 'subscribe' && msg.channel) {
          subscribeClientToChannel(socket, msg.channel);
          return;
        }
        if (msg.type === 'ping' || msg.action === 'ping') {
          safeSend(socket, { type: 'pong' });
        }
      } catch {
        // Ignore malformed JSON
      }
    });

    socket.on('close', (code, reason) => {
      cleanupClient(socket);
      logger.info(`[WS] Disconnected: ${ip} (code=${code}, remaining: ${wss.clients.size})`);
    });

    socket.on('error', (err) => {
      logger.warn(`[WS] Socket error from ${ip}: ${err.message}`);
    });
  });

  wss.on('error', (err) => {
    logger.error(`[WS] Server error: ${err.message}`);
  });
}

// ─── GLOBAL BROADCAST (FALLBACK / ANNOUNCEMENTS) ─────────────────────────────
function broadcast(payload) {
  if (!wss || wss.clients.size === 0) return;
  const raw = JSON.stringify(payload);
  let sent = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(raw); sent++; } catch { /* ignore */ }
    }
  }
  if (sent > 0) logger.debug(`[WS] Broadcast → ${sent} client(s): ${payload.type}`);
}

// ─── GRACEFUL SHUTDOWN ───────────────────────────────────────────────────────
function close() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (wss) {
    for (const ws of wss.clients) ws.terminate();
    wss.close(() => logger.info('[WS] Server closed.'));
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function safeSend(socket, payload) {
  try {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  } catch { /* ignore */ }
}

function clientCount() {
  return wss ? wss.clients.size : 0;
}

module.exports = { attach, broadcast, close, clientCount };
