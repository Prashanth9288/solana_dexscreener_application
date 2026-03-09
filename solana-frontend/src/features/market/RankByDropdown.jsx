import React, { useState, useRef, useEffect } from 'react';
import useMarketStore from '../../store/slices/useMarketStore';
import { Crown, Check } from 'lucide-react';
import '../../styles/market/RankByDropdown.css';

const RANK_OPTIONS = [
  { id: 'trending_1h', label: 'Trending 1H' },
  { id: 'trending_6h', label: 'Trending 6H' },
  { id: 'trending_24h', label: 'Trending 24H' },
  { id: 'trade_count', label: 'Txns' },
  { id: 'buy_count', label: 'Buys' },
  { id: 'sell_count', label: 'Sells' },
  { id: 'total_volume_usd', label: 'Volume' },
  { id: 'change_24h', label: '24H price change' },
  { id: 'change_6h', label: '6H price change' },
  { id: 'change_1h', label: '1H price change' },
  { id: 'change_5m', label: '5M price change' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'mcap', label: 'Market Cap' },
  { id: 'fdv', label: 'FDV' },
  { id: 'created_at', label: 'Pair age' },
  { id: 'boosts', label: 'Boosts' }
];

export default function RankByDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  const sortBy  = useMarketStore((s) => s.sortBy);
  const sortDir = useMarketStore((s) => s.sortDir);
  const setSort = useMarketStore((s) => s.setSort);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // If sortBy is "total_volume_usd", the label is "Volume". 
  // Wait, by default the DexScreen UI shows "Trending 5M" or similar.
  // We will map the current active sortBy back to a label.
  let activeLabel = 'Trending 5M';
  if (sortBy === 'trending_5m') activeLabel = 'Trending 5M';
  else {
    const found = RANK_OPTIONS.find(o => o.id === sortBy);
    if (found) activeLabel = found.label;
  }

  const handleRankSelect = (id) => {
    setSort(id, sortDir);
    setIsOpen(false);
  };

  const handleOrderSelect = (dir) => {
    setSort(sortBy, dir);
  };

  return (
    <div className="rank-by-dropdown-container" ref={dropdownRef}>
      <button 
        className="rank-by-dropdown-btn" 
        onClick={() => setIsOpen(!isOpen)}
        style={isOpen ? { background: '#1e2433' } : {}}
      >
        <Crown className="dex-icon-sm" /> 
        Rank by: {sortDir === 'desc' ? '↓' : '↑'} {activeLabel}
      </button>

      {isOpen && (
        <div className="rank-by-menu">
          <div className="rank-by-section-title">Order</div>
          
          <div 
            className={`rank-by-item ${sortDir === 'desc' ? 'rank-by-item-active' : ''}`}
            onClick={() => handleOrderSelect('desc')}
          >
            {sortDir === 'desc' && <Check className="rank-by-item-check" size={14} />}
            Descending
          </div>
          
          <div 
            className={`rank-by-item ${sortDir === 'asc' ? 'rank-by-item-active' : ''}`}
            onClick={() => handleOrderSelect('asc')}
          >
            {sortDir === 'asc' && <Check className="rank-by-item-check" size={14} />}
            Ascending
          </div>
          
          <div className="rank-by-section-title" style={{ marginTop: '8px' }}>Rank by</div>
          
          <div className="rank-by-scroll-area">
            {/* Hard-coded Trending 5M since it was in the user screenshot but not uniquely mapped in my initial list easily */}
            <div 
              className={`rank-by-item ${sortBy === 'trending_5m' ? 'rank-by-item-active' : ''}`}
              onClick={() => handleRankSelect('trending_5m')}
            >
              {sortBy === 'trending_5m' && <Check className="rank-by-item-check" size={14} />}
              Trending 5M
            </div>

            {RANK_OPTIONS.map((opt) => (
              <div 
                key={opt.id}
                className={`rank-by-item ${sortBy === opt.id ? 'rank-by-item-active' : ''}`}
                onClick={() => handleRankSelect(opt.id)}
              >
                {sortBy === opt.id && <Check className="rank-by-item-check" size={14} />}
                {opt.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
