import React, { useState, useMemo, useCallback } from 'react';
import useAuthStore from '../../store/slices/useAuthStore';
import useWatchlistStore from '../../store/slices/useWatchlistStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import WatchlistRow from './WatchlistRow';
import '../../styles/watchlist/Watchlist.css';

/**
 * WatchlistPanel ensures exactly one WebSocket handshake is initialized
 * for ALL starred tokens dynamically, propagating ticks natively to rows.
 */
function WatchlistPanel() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const items = useWatchlistStore((s) => s.items);

  // Mapped { [token_address]: { price, change } }
  const [liveData, setLiveData] = useState({});

  // 1. Compute WebSocket Channels to Subscribe
  const wsChannels = useMemo(() => {
    return items.map(item => `trades:${item.token_address}`);
  }, [items]);

  // 2. Handle incoming WS messages
  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'trade' || msg.type === 'trades') {
      const payload = msg.type === 'trades' ? msg.data[0] : msg.data;
      if (!payload) return;

      const { token_address, price, change24h } = payload;
      
      setLiveData(prev => {
        // Only trigger React state updates if value fundamentally changed
        const current = prev[token_address];
        if (current && current.price === price) return prev;
        
        return {
          ...prev,
          [token_address]: {
            price,
            change: change24h !== undefined ? change24h : current?.change
          }
        };
      });
    }
  }, []);

  // 3. Connect! Only active if authenticated AND has items.
  useWebSocket(wsChannels, handleWsMessage, isAuthenticated && wsChannels.length > 0);

  if (!isAuthenticated) {
    return (
      <div className="watchlist-panel">
        <div className="watchlist-header">
          <span className="watchlist-title">Watchlist</span>
        </div>
        <div className="watchlist-content">
          <div className="watchlist-empty" style={{ paddingTop: '64px' }}>
            Connect wallet to save watchlist
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="watchlist-panel">
      <div className="watchlist-header">
        <span className="watchlist-title">Watchlist</span>
      </div>
      
      <div className="watchlist-content">
        {items.length === 0 ? (
          <div className="watchlist-empty" style={{ paddingTop: '64px' }}>
            No tokens in watchlist
          </div>
        ) : (
          items.map(item => (
             <WatchlistRow 
               key={item.token_address} 
               item={item} 
               ticker={liveData[item.token_address]} 
             />
          ))
        )}
      </div>
    </div>
  );
}

export default React.memo(WatchlistPanel);
