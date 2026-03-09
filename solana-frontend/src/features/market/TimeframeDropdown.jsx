import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Clock } from 'lucide-react';
import useMarketStore from '../../store/slices/useMarketStore';
import { MARKET_TIMEFRAMES } from '../../constants';
import '../../styles/market/TimeframeDropdown.css';

const TIMEFRAME_LABELS = {
  '5m': 'Last 5 minutes',
  '1h': 'Last hour',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
};

export default function TimeframeDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const activeTimeframe = useMarketStore((s) => s.activeTimeframe);
  const setActiveTimeframe = useMarketStore((s) => s.setActiveTimeframe);

  // Close on outside click
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

  const handleSelect = (id) => {
    setActiveTimeframe(id);
    setIsOpen(false);
  };

  const currentLabel = TIMEFRAME_LABELS[activeTimeframe] || `Last ${activeTimeframe}`;

  return (
    <div className="timeframe-dropdown-container" ref={dropdownRef}>
      <button 
        className="timeframe-dropdown-btn" 
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <Clock size={14} />
        {currentLabel}
        <ChevronDown 
          size={14} 
          style={{ 
            transition: 'transform 0.2s', 
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' 
          }} 
        />
      </button>

      {isOpen && (
        <div className="timeframe-dropdown-menu" role="listbox">
          {MARKET_TIMEFRAMES.map((tf) => {
            const isActive = activeTimeframe === tf.id;
            return (
              <div 
                key={tf.id} 
                className="timeframe-dropdown-item"
                onClick={() => handleSelect(tf.id)}
                role="option"
                aria-selected={isActive}
              >
                {isActive ? (
                  <Check className="timeframe-dropdown-checkmark" />
                ) : (
                  <div style={{ width: 14 }} /> // Placeholder to keep labels aligned
                )}
                <span className="timeframe-dropdown-item-content">
                  {TIMEFRAME_LABELS[tf.id] || tf.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
