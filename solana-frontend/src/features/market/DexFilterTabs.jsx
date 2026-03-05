import React, { useCallback } from 'react';
import useMarketStore from '../../store/slices/useMarketStore';
import { DEX_LIST, MARKET_TIMEFRAMES } from '../../constants';
import { TrendingUp, ArrowUp, Zap, SlidersHorizontal, ChevronDown, Check, User, Bot, Crown } from 'lucide-react';
import '../../styles/market/DexFilterTabs.css';

/* ── Custom SVGs for Dexes ── */
const DexLogos = {
  all: () => <span className="dex-filter-logo-all">🔍</span>,
  pumpswap: () => <img src="https://dd.dexscreener.com/ds-data/dexes/solana/pumpswap.png" width="16" height="16" className="dex-filter-logo-img" onError={(e) => {e.target.style.display='none'}} />,
  meteora: () => <img src="https://dd.dexscreener.com/ds-data/dexes/solana/meteora.png" width="16" height="16" className="dex-filter-logo-img" onError={(e) => {e.target.style.display='none'}} />,
  raydium: () => <img src="https://dd.dexscreener.com/ds-data/dexes/solana/raydium.png" width="16" height="16" className="dex-filter-logo-img" onError={(e) => {e.target.style.display='none'}} />,
  orca: () => <img src="https://dd.dexscreener.com/ds-data/dexes/solana/orca.png" width="16" height="16" className="dex-filter-logo-img" onError={(e) => {e.target.style.display='none'}} />,
  'pump.fun': () => <img src="https://dd.dexscreener.com/ds-data/dexes/solana/pumpfun.png" width="16" height="16" className="dex-filter-logo-img" onError={(e) => {e.target.style.display='none'}} />,
};

const FILTER_TABS = [
  { id: 'top',      label: 'Top',      icon: ArrowUp },
  { id: 'gainers',  label: 'Gainers',  icon: ArrowUp },
  { id: 'new',      label: 'New Pairs',icon: Zap },
];

function DexFilterTabs() {
  const activeDex        = useMarketStore((s) => s.activeDex);
  const setActiveDex     = useMarketStore((s) => s.setActiveDex);
  const activeFilter     = useMarketStore((s) => s.activeFilter);
  const setActiveFilter  = useMarketStore((s) => s.setActiveFilter);
  const activeTimeframe  = useMarketStore((s) => s.activeTimeframe);
  const setActiveTimeframe = useMarketStore((s) => s.setActiveTimeframe);

  const handleDex = useCallback((id) => setActiveDex(id), [setActiveDex]);

  return (
    <div className="dex-filter-container">
      {/* DEX Tabs */}
      <div className="dex-filter-tabs-wrapper">
        {DEX_LIST.map(({ id, label, color }) => {
          const isActive = activeDex === id;
          const c = color || '#8b99b0';
          const Logo = DexLogos[id] || DexLogos.all;
          return (
            <button
              key={id}
              onClick={() => handleDex(id)}
              className={`dex-tab-btn ${isActive ? 'dex-tab-btn-active' : 'dex-tab-btn-inactive'}`}
            >
              <Logo />
              {label}
              {isActive && (
                <div 
                  className="dex-tab-indicator"
                  style={{
                    background: id === 'all' ? '#f0f3fa' : c,
                    boxShadow: `0 -2px 8px ${id === 'all' ? '#f0f3fa' : c}80`
                  }} 
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="dex-filter-bar">
        
        {/* LEFT GROUP */}
        <div className="dex-filter-group">
          {/* Last 24 Hours Dropdown (Solid Blue) */}
          <button className="dex-time-dropdown-btn">
            ⏱ Last 24 hours <ChevronDown className="dex-icon-sm" />
          </button>

          {/* Trending & Timeframes Combined Pill (Solid Blue outline) */}
          <div className="dex-trending-pill">
            <button className="dex-trending-label-btn">
              🔥 Trending <span className="dex-icon-info">ⓘ</span>
            </button>
            <div className="dex-timeframes-container">
              {MARKET_TIMEFRAMES.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setActiveTimeframe(id)}
                  className={`dex-timeframe-btn ${activeTimeframe === id ? 'dex-timeframe-btn-active' : 'dex-timeframe-btn-inactive'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Other Filter Tabs (Dark outline) directly connected without 1px div separator */}
          {FILTER_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveFilter(id)}
              className={`dex-filter-pill ${activeFilter === id ? 'dex-filter-pill-active' : 'dex-filter-pill-inactive'}`}
            >
              <Icon className="dex-icon-sm" style={activeFilter === id ? {color: '#fff'} : {color: '#a9b1c2'}} />
              {label}
            </button>
          ))}

          {/* Small icon filter toggles */}
          <div className="dex-icon-toggles-container">
             <button className="dex-icon-toggle-btn dex-icon-btn-user"><User className="dex-icon-sm"/><Check className="dex-icon-xs"/></button>
             <button className="dex-icon-toggle-btn middle dex-icon-btn-zap"><Zap className="dex-icon-sm"/><Check className="dex-icon-xs"/></button>
             <button className="dex-icon-toggle-btn last dex-icon-btn-bot"><Bot className="dex-icon-sm"/><Check className="dex-icon-xs"/></button>
          </div>
        </div>

        {/* RIGHT GROUP */}
        <div className="dex-filter-group">
          <button className="dex-toolbar-right-btn">
            <Crown className="dex-icon-sm" /> 
            Rank by: ↓ Trending {MARKET_TIMEFRAMES.find(t => t.id === activeTimeframe)?.label || '5M'}
          </button>
          <button className="dex-toolbar-right-btn">
            <SlidersHorizontal className="dex-icon-sm" />
            Filters
          </button>
          <button className="dex-toolbar-right-icon-btn">
            ⚙️
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(DexFilterTabs);
