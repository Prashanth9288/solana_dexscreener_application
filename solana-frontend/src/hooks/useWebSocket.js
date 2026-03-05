import { useState, useEffect, useRef, useCallback } from 'react';
import { getRecentTrades } from '../services/api';

/**
 * useWebSocket — Production-grade Redis Pub/Sub WebSocket client
 *
 * Features:
 *  - Sends { action: 'subscribe', channel: 'trades:<mint>' } handshake on connect
 *  - Exponential backoff reconnection (1s → 30s cap)
 *  - Missed-tick recovery: fetches /analytics/recent on reconnect
 *  - Auto-resubscribes all channels after a reconnect
 *  - Clean cleanup on component unmount
 *
 * @param {string|string[]} channels  e.g. 'trades:EPjFW...' or ['trades:A', 'trades:B']
 * @param {function}        onMessage Callback for incoming parsed messages
 * @param {boolean}         enabled   Whether to connect at all
 */
export function useWebSocket(channels, onMessage, enabled = true) {
  const [connected, setConnected] = useState(false);

  const wsRef                = useRef(null);
  const reconnectTimerRef    = useRef(null);
  const backoffRef           = useRef(1000);
  const enabledRef           = useRef(enabled);
  const channelsRef          = useRef(null);
  const onMessageRef         = useRef(onMessage);
  const lastDisconnectTimeRef = useRef(null);
  const mountedRef           = useRef(true);

  // Keep refs always fresh — avoids stale closures in callbacks
  enabledRef.current  = enabled;
  onMessageRef.current = onMessage;

  // Normalize to array
  const normalizedChannels = Array.isArray(channels)
    ? channels
    : channels
    ? [channels]
    : [];
  channelsRef.current = normalizedChannels;

  // Build WebSocket URL
  const getWsUrl = useCallback(() => {
    let base = import.meta.env.VITE_WS_URL ||
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    return base.endsWith('/ws') ? base : `${base}/ws`;
  }, []);

  // Missed-Tick Recovery: fetch recent trades since disconnect
  const recoverMissedTrades = useCallback(async () => {
    if (!lastDisconnectTimeRef.current) return;
    try {
      const result = await getRecentTrades(50);
      if (result?.data && onMessageRef.current) {
        onMessageRef.current({ type: 'trades', data: result.data, source: 'recovery' });
      }
    } catch {
      // Non-fatal: live stream will catch up
    } finally {
      lastDisconnectTimeRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || normalizedChannels.length === 0) return;

    function connect() {
      // Cancel any pending reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const wsUrl = getWsUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }

        setConnected(true);
        backoffRef.current = 1000; // Reset backoff on successful connection

        // Production Handshake: subscribe to every requested Redis channel
        for (const channel of channelsRef.current) {
          ws.send(JSON.stringify({ action: 'subscribe', channel }));
        }

        // Recover any trades missed while the socket was down
        recoverMissedTrades();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if ((data.type === 'trades' || data.type === 'trade') && onMessageRef.current) {
            onMessageRef.current(data);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;

        setConnected(false);
        wsRef.current = null;
        lastDisconnectTimeRef.current = Date.now();

        if (enabledRef.current) {
          const delay = backoffRef.current;
          // Exponential backoff capped at 30 seconds
          backoffRef.current = Math.min(backoffRef.current * 1.5, 30000);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onclose will fire next and handle reconnect
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  // Only reconnect when the channel list or enabled flag changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, channels]);

  return { connected };
}
