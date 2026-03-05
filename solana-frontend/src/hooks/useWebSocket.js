import { useState, useEffect, useRef } from 'react';

/**
 * useWebSocket — Manages connection to the Render backend WebSocket.
 * 
 * Features:
 * - Auto-reconnect with backoff
 * - Channel subscription handling
 * - Clean cleanup on unmount
 * 
 * @param {string} channel - The channel to subscribe to (e.g. 'trades:all' or 'trades:<address>')
 * @param {function} onMessage - Callback for incoming parsed messages
 * @param {boolean} enabled - Whether to connect (used to pause until token data loads)
 */
export function useWebSocket(channel, onMessage, enabled = true) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const backoffRef = useRef(1000);

  useEffect(() => {
    if (!enabled || !channel) return;

    function connect() {
      // Get base URL from env or fallback to current host
      let baseWsUrl = import.meta.env.VITE_WS_URL || 
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

      // Ensure the URL ends with the /ws path required by the backend
      const wsUrl = baseWsUrl.endsWith('/ws') ? baseWsUrl : `${baseWsUrl}/ws`;

      console.log(`[WS] Connecting to ${wsUrl}...`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        setConnected(true);
        backoffRef.current = 1000; // Reset backoff

        // Subscribe to standard generic trade broadcast
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'trades' }));
        // Legacy support if specific channel passed
        if (channel && channel !== 'trades') {
           ws.send(JSON.stringify({ type: 'subscribe', channel }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Only forward matching trade types
          if (data.type === 'trades' || data.type === 'trade') {
            if (onMessage) onMessage(data);
          }
        } catch (err) {
          console.warn('[WS] Failed to parse message', err);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setConnected(false);
        wsRef.current = null;

        // Auto-reconnect with exponential backoff
        if (enabled) {
          console.log(`[WS] Reconnecting in ${backoffRef.current}ms...`);
          reconnectTimeoutRef.current = setTimeout(connect, backoffRef.current);
          backoffRef.current = Math.min(backoffRef.current * 1.5, 30000);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] Connection error', err);
        // Let onclose handle the reconnect
      };
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [channel, enabled, onMessage]);

  return { connected };
}
