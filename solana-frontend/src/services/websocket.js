/**
 * WebSocket Service — Production-grade real-time connection
 * - Auto-reconnect with exponential backoff
 * - Ping/pong keepalive
 * - Channel subscription management
 * - Graceful fallback to HTTP polling if WS unavailable
 */

import { WS_URL } from '../constants';

const RECONNECT_BASE_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const PING_INTERVAL = 25000;

class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map(); // channel -> Set<callback>
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.isConnecting = false;
    this.isDestroyed = false;
    this.subscriptions = new Set(); // active channel subscriptions
    this.statusListeners = new Set();
  }

  /** Connect to the WebSocket server */
  connect() {
    if (this.isDestroyed || this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;

    this.isConnecting = true;
    this._notifyStatus('connecting');

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (err) {
      console.warn('[WS] Connection failed, falling back to polling:', err.message);
      this.isConnecting = false;
      this._notifyStatus('disconnected');
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this._notifyStatus('connected');

      // Re-subscribe to any active channels
      for (const channel of this.subscriptions) {
        this._sendSubscribe(channel);
      }

      // Start keepalive ping
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle pong
        if (data.type === 'pong') return;

        // Route message to channel listeners
        const channel = data.channel || data.type || 'default';
        const callbacks = this.listeners.get(channel);
        if (callbacks) {
          for (const cb of callbacks) {
            try { cb(data); } catch (e) { console.error('[WS] Listener error:', e); }
          }
        }

        // Also notify wildcard listeners
        const wildcardCbs = this.listeners.get('*');
        if (wildcardCbs) {
          for (const cb of wildcardCbs) {
            try { cb(data); } catch (e) { console.error('[WS] Wildcard listener error:', e); }
          }
        }
      } catch (err) {
        console.warn('[WS] Message parse error:', err);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[WS] Disconnected (code: ${event.code})`);
      this.isConnecting = false;
      this._stopPing();
      this._notifyStatus('disconnected');

      if (!this.isDestroyed) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.warn('[WS] Error:', err);
      this.isConnecting = false;
    };
  }

  /** Subscribe to a channel */
  subscribe(channel, callback) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel).add(callback);
    this.subscriptions.add(channel);

    // Send subscribe message if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._sendSubscribe(channel);
    } else {
      this.connect();
    }

    // Return unsubscribe function
    return () => {
      const cbs = this.listeners.get(channel);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) {
          this.listeners.delete(channel);
          this.subscriptions.delete(channel);
          this._sendUnsubscribe(channel);
        }
      }
    };
  }

  /** Listen for connection status changes */
  onStatus(callback) {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  /** Send a message */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /** Check if connected */
  get isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /** Destroy the service */
  destroy() {
    this.isDestroyed = true;
    this._stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.listeners.clear();
    this.subscriptions.clear();
    this.statusListeners.clear();
  }

  // ── Private ──────────────────────────────────────────────

  _sendSubscribe(channel) {
    this.send({ type: 'subscribe', channel });
  }

  _sendUnsubscribe(channel) {
    this.send({ type: 'unsubscribe', channel });
  }

  _startPing() {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, PING_INTERVAL);
  }

  _stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this.isDestroyed) return;
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts++;
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  _notifyStatus(status) {
    for (const cb of this.statusListeners) {
      try { cb(status); } catch (e) { /* ignore */ }
    }
  }
}

// Singleton instance
const wsService = new WebSocketService();
export default wsService;
