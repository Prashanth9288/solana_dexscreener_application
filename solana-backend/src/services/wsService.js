/**
 * wsService.js — Production WebSocket Broadcaster
 *
 * Singleton WebSocket server attached to the Express HTTP server.
 * Broadcasts decoded trade events to all connected frontend clients.
 *
 * Usage:
 *   const wsBroadcaster = require('./wsService');
 *   wsBroadcaster.broadcast({ type: 'trade', data: tradeObject });
 *
 * Clients subscribe by sending:
 *   { type: 'subscribe', channel: 'trades' }
 */

const { WebSocketServer, WebSocket } = require('ws');
const logger = require('../utils/logger');

let wss = null;

/**
 * Attach the WebSocket server to the existing HTTP server instance.
 * Call this once in server.js after `app.listen()`.
 * @param {http.Server} httpServer
 */
function attach(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  logger.info('[WS] WebSocket server attached on path /ws');

  wss.on('connection', (socket, req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logger.info(`[WS] Client connected: ${ip} (total: ${wss.clients.size})`);

    // Send a welcome packet so the frontend knows connection succeeded
    safeSend(socket, { type: 'connected', message: 'Solana DEX Terminal WebSocket ready' });

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        logger.debug(`[WS] Message from ${ip}: ${JSON.stringify(msg)}`);

        // Acknowledge subscription requests
        if (msg.type === 'subscribe') {
          safeSend(socket, { type: 'subscribed', channel: msg.channel });
        }
        if (msg.type === 'ping') {
          safeSend(socket, { type: 'pong' });
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.on('close', () => {
      logger.info(`[WS] Client disconnected: ${ip} (remaining: ${wss.clients.size})`);
    });

    socket.on('error', (err) => {
      logger.warn(`[WS] Client error: ${err.message}`);
    });
  });

  wss.on('error', (err) => {
    logger.error(`[WS] Server error: ${err.message}`);
  });
}

/**
 * Broadcast a JSON payload to ALL connected WebSocket clients.
 * Silently skips clients that aren't in OPEN state.
 * @param {object} payload
 */
function broadcast(payload) {
  if (!wss || wss.clients.size === 0) return;

  const raw = JSON.stringify(payload);
  let sent = 0;

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(raw);
      sent++;
    }
  }

  if (sent > 0) {
    logger.debug(`[WS] Broadcast to ${sent} client(s): ${payload.type}`);
  }
}

/** Safe-send helper — swallows send errors on already-closed sockets */
function safeSend(socket, payload) {
  try {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  } catch { /* ignore */ }
}

/** Returns current connected client count */
function clientCount() {
  return wss ? wss.clients.size : 0;
}

module.exports = { attach, broadcast, clientCount };
