import React, { useEffect, useRef, useState } from 'react';
import StarButton from './StarButton';

/**
 * Renders a single row in the Watchlist Panel.
 * Listens to websocket ticks passed via props from WatchlistPanel to flash natively.
 */
function WatchlistRow({ item, ticker }) {
  const { token_address } = item;
  
  const [flashClass, setFlashClass] = useState('');
  const flashTimeout = useRef(null);
  const prevPriceRef = useRef(ticker?.price || 0);

  // Flash Effect natively handled against pure prop changes
  useEffect(() => {
    if (!ticker?.price) return;
    
    if (prevPriceRef.current !== ticker.price) {
      const isUp = ticker.price > prevPriceRef.current;
      setFlashClass(isUp ? 'flash-up' : 'flash-down');
      
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
      flashTimeout.current = setTimeout(() => setFlashClass(''), 400);
      
      prevPriceRef.current = ticker.price;
    }
  }, [ticker?.price]);

  const displayPrice = ticker?.price > 0 ? ticker.price.toFixed(4) : '—';
  const displayChange = ticker?.change ? `${ticker.change > 0 ? '+' : ''}${ticker.change.toFixed(2)}%` : '—';

  return (
    <div className="watchlist-row">
      <StarButton tokenAddress={token_address} />
      <div className="watchlist-symbol">
        {token_address.slice(0, 6)}...
      </div>
      <div className={`watchlist-price ${flashClass}`}>
        ${displayPrice}
      </div>
      <div className="watchlist-change" style={{ color: ticker?.change >= 0 ? '#16c784' : '#ea3943' }}>
        {displayChange}
      </div>
    </div>
  );
}

export default React.memo(WatchlistRow);
