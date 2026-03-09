import React, { useState, useEffect } from 'react';
import useMarketStore from '../../store/slices/useMarketStore';
import { X, Check, User, Zap, Bot } from 'lucide-react';
import '../../styles/market/FilterModal.css';

const TIMEFRAMES = [
  { id: 't24h', label: '24H' },
  { id: 't6h', label: '6H' },
  { id: 't1h', label: '1H' },
  { id: 't5m', label: '5M' }
];

export default function FilterModal({ isOpen, onClose }) {
  const globalFilters = useMarketStore((s) => s.filters);
  const setFilters = useMarketStore((s) => s.setFilters);
  const resetFilters = useMarketStore((s) => s.resetFilters);

  // Local state for all inputs to prevent lag and allow "Apply" vs "Cancel"
  const [localFilters, setLocalFilters] = useState(globalFilters);

  useEffect(() => {
    if (isOpen) {
      setLocalFilters(globalFilters);
    }
  }, [isOpen, globalFilters]);

  if (!isOpen) return null;

  const handleApply = () => {
    setFilters(localFilters);
    onClose();
  };

  const handleReset = () => {
    resetFilters();
    onClose();
  };

  const updateSimple = (key, field, val) => {
    setLocalFilters(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: val }
    }));
  };

  const updateTimeframe = (tf, key, field, val) => {
    setLocalFilters(prev => ({
      ...prev,
      [tf]: {
        ...prev[tf],
        [key]: { ...prev[tf][key], [field]: val }
      }
    }));
  };

  return (
    <div className="filter-modal-overlay" onClick={onClose}>
      <div className="filter-modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="filter-modal-header">
          <span className="filter-modal-title">Customize Filters</span>
          <button className="filter-modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="filter-modal-body">
          {/* Top Tabs Mockup */}
          <div className="filter-top-tabs">
            <div className="filter-top-tab">
              <img src="https://dd.dexscreener.com/ds-data/chains/solana.png" width="20" height="20" alt="Solana" />
              Solana
            </div>
            <div className="filter-top-tab">All DEXes</div>
          </div>

          <div className="filter-section-divider">
            <div className="filter-divider-line" />
            <span className="filter-divider-text">Filters (Optional)</span>
            <div className="filter-divider-line" />
          </div>

          <div className="filter-grid">
            {/* Profile Flags */}
            <div className="filter-tag-row">
              <span className="filter-label">Profile:</span>
              <div className="filter-tag-group">
                <button className="filter-tag-btn active"><User size={14} /> Profile <Check size={12} /></button>
                <button className="filter-tag-btn active"><Zap size={14} /> Boosted <Check size={12} /></button>
                <button className="filter-tag-btn active">📢 Ads <Check size={12} /></button>
              </div>
            </div>

            {/* Core Metrics */}
            <FilterRow label="Liquidity:" value={localFilters.liquidity} onChange={(f, v) => updateSimple('liquidity', f, v)} prefix="$" />
            <FilterRow label="Market cap:" value={localFilters.mcap} onChange={(f, v) => updateSimple('mcap', f, v)} prefix="$" />
            <FilterRow label="FDV:" value={localFilters.fdv} onChange={(f, v) => updateSimple('fdv', f, v)} prefix="$" />
            <FilterRow label="Pair age:" value={localFilters.pairAge} onChange={(f, v) => updateSimple('pairAge', f, v)} suffix="hours" />

            {/* Timeframe Based Metrics */}
            {TIMEFRAMES.map(tf => (
              <React.Fragment key={tf.id}>
                <div className="mt-4" />
                <FilterRow label={`${tf.label} txns:`} value={localFilters[tf.id].txns} onChange={(f, v) => updateTimeframe(tf.id, 'txns', f, v)} />
                <FilterRow label={`${tf.label} buys:`} value={localFilters[tf.id].buys} onChange={(f, v) => updateTimeframe(tf.id, 'buys', f, v)} />
                <FilterRow label={`${tf.label} sells:`} value={localFilters[tf.id].sells} onChange={(f, v) => updateTimeframe(tf.id, 'sells', f, v)} />
                <FilterRow label={`${tf.label} volume:`} value={localFilters[tf.id].volume} onChange={(f, v) => updateTimeframe(tf.id, 'volume', f, v)} prefix="$" />
                <FilterRow label={`${tf.label} change:`} value={localFilters[tf.id].change} onChange={(f, v) => updateTimeframe(tf.id, 'change', f, v)} suffix="%" />
              </React.Fragment>
            ))}

            {/* Labels Mockup */}
            <div className="filter-row">
              <span className="filter-label">Labels:</span>
              <div className="col-span-2">
                 <input className="filter-input" placeholder="comma separated labels" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="filter-modal-footer">
          <button className="filter-apply-btn" onClick={handleApply}>
            <Check size={16} /> Apply
          </button>
          <button 
            className="ml-4 text-[13px] text-[#6b758c] hover:text-white font-bold" 
            onClick={handleReset}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterRow({ label, value, onChange, prefix, suffix }) {
  return (
    <div className="filter-row">
      <span className="filter-label">{label}</span>
      
      <div className="filter-input-wrapper">
        {prefix && <span className="filter-input-prefix">{prefix}</span>}
        <input 
          className={`filter-input ${prefix ? 'filter-input-with-prefix' : ''} ${suffix ? 'filter-input-with-suffix' : ''}`}
          placeholder="Min"
          type="number"
          value={value.min}
          onChange={e => onChange('min', e.target.value)}
        />
        {suffix && <span className="filter-input-suffix">{suffix}</span>}
      </div>

      <div className="filter-input-wrapper">
        {prefix && <span className="filter-input-prefix">{prefix}</span>}
        <input 
          className={`filter-input ${prefix ? 'filter-input-with-prefix' : ''} ${suffix ? 'filter-input-with-suffix' : ''}`}
          placeholder="Max"
          type="number"
          value={value.max}
          onChange={e => onChange('max', e.target.value)}
        />
        {suffix && <span className="filter-input-suffix">{suffix}</span>}
      </div>
    </div>
  );
}
