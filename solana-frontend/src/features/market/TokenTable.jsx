import React, { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useShallow } from 'zustand/react/shallow';
import useMarketStore from '../../store/slices/useMarketStore';
import { formatUSD, formatNumber, shortenAddress, formatPercent, formatAge } from '../../utils/formatters';
import { ChevronDown, ChevronUp } from 'lucide-react';
import '../../styles/market/TokenTable.css';

/* ═══════════════════════════════════════════════════════════════════
   SECTION 1 — CONSTANTS & TAILWIND ALIGNMENT
   ═══════════════════════════════════════════════════════════════════ */
// Consolidated to exactly 12 columns to completely eliminate horizontal scrolling 
// up to 1050px laptops. Token column shrinks down to 240px but absorbs all free space.
const ROW_H = 48;

/* ── Percent change ────────────────────────────────────────────────── */
const ChangeCell = React.memo(function ChangeCell({ value }) {
  if (value == null || isNaN(value)) return <span className="token-table-cell-change-empty">—</span>;
  const v = Number(value);
  // Dexscreener matched exact colors
  const colorClass = v > 0 ? 'text-[#16c784]' : v < 0 ? 'text-[#ea3943]' : 'text-[#6b758c]';
  return <span className={`${colorClass} tabular-nums font-mono text-right`}>{formatPercent(v)}</span>;
});

/* ═══════════════════════════════════════════════════════════════════
   TOKEN ROW
   ═══════════════════════════════════════════════════════════════════ */
const TokenRow = React.memo(function TokenRow({ pair, rank, style, visibleColumns, gridTemplate, columnOrder }) {
  const navigate = useNavigate();
  const bm = pair.base_token_meta;
  const symbol = bm?.symbol || shortenAddress(pair.base_token, 3);
  const name   = bm?.name   || shortenAddress(pair.base_token);
  const logo   = bm?.logoURI;

  const handleClick = useCallback(() => {
    navigate(`/pair/${pair.base_token}-${pair.quote_token}`);
  }, [navigate, pair.base_token, pair.quote_token]);

  const c5m = pair.price_change_5m ?? pair.change_5m ?? null;
  const c1h = pair.price_change_1h ?? pair.change_1h ?? null;
  const c6h = pair.price_change_6h ?? pair.change_6h ?? null;
  const c24h = pair.price_change_24h ?? pair.change_24h ?? null;
  const age = formatAge(pair.first_trade_at || pair.created_at || pair.last_trade_at || pair.block_time);

  return (
    <div
      onClick={handleClick}
      className="token-table-row"
      style={{
        ...style,
        gridTemplateColumns: gridTemplate,
      }}
    >
      <div className="token-table-cell-token" style={{ userSelect: 'none' }}>
        <span className="token-table-cell-rank">#{rank}</span>
        <div className="token-table-cell-logo">
          {logo ? (
            <img src={logo} alt="" className="token-table-cell-logo-img" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
          ) : (
            <span className="token-table-cell-logo-fallback">{symbol.slice(0, 2)}</span>
          )}
        </div>
        <div className="token-table-cell-info">
          <div className="token-table-cell-info-top">
            <span className="token-table-cell-symbol">{symbol}</span>
            <span className="token-table-cell-quote">/ SOL</span>
          </div>
          <span className="token-table-cell-name">{name}</span>
        </div>
      </div>

      {columnOrder.map(id => {
        if (!visibleColumns[id]) return null;
        switch (id) {
          case 'price': return <div key={id} className="token-table-cell-price">{formatUSD(pair.price_usd || pair.avg_price_usd)}</div>;
          case 'age': return <div key={id} className="token-table-cell-numeric">{age}</div>;
          case 'txns': return <div key={id} className="token-table-cell-numeric">{formatNumber(pair.txns_24h || pair.trade_count)}</div>;
          case 'volume': return <div key={id} className="token-table-cell-numeric">{formatUSD(pair.volume_24h || pair.total_volume_usd)}</div>;
          case 'makers': return <div key={id} className="token-table-cell-numeric">{formatNumber(pair.makers_24h || pair.unique_wallets || 0)}</div>;
          case 'c5m': return <div key={id} className="token-table-cell-change"><ChangeCell value={c5m} /></div>;
          case 'c1h': return <div key={id} className="token-table-cell-change"><ChangeCell value={c1h} /></div>;
          case 'c6h': return <div key={id} className="token-table-cell-change"><ChangeCell value={c6h} /></div>;
          case 'c24h': return <div key={id} className="token-table-cell-change"><ChangeCell value={c24h} /></div>;
          case 'liquidity': return <div key={id} className="token-table-cell-numeric">{pair.liquidity_usd ? formatUSD(pair.liquidity_usd) : '—'}</div>;
          case 'mcap': return <div key={id} className="token-table-cell-numeric">{pair.market_cap ? formatUSD(pair.market_cap) : '—'}</div>;
          default: return null;
        }
      })}
    </div>
  );
}, (prev, next) => {
  return prev.pair.base_token === next.pair.base_token
    && (prev.pair.price_usd || prev.pair.avg_price_usd) === (next.pair.price_usd || next.pair.avg_price_usd)
    && (prev.pair.txns_24h || prev.pair.trade_count) === (next.pair.txns_24h || next.pair.trade_count)
    && prev.rank === next.rank;
});

/* ═══════════════════════════════════════════════════════════════════
   SORTABLE HEADER CELL
   ═══════════════════════════════════════════════════════════════════ */
function SortHeader({ label, field, sortBy, sortDir, toggleSort, align = 'right' }) {
  const isActive = sortBy === field;
  return (
    <div className={`cursor-pointer select-none token-table-cell ${align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => toggleSort(field)}>
      <span className={`inline-flex items-center gap-1 ${isActive ? 'text-[#f0f3fa]' : 'text-[#8b99b0] hover:text-[#f0f3fa] transition-colors'}`}>
        {label === 'PRICE' ? <>{label} <span className="text-[10px] opacity-60 ml-0.5">$</span></> : label}
        {isActive && (sortDir === 'desc'
          ? <ChevronDown className="w-3 h-3 text-[#f0f3fa]" />
          : <ChevronUp className="w-3 h-3 text-[#f0f3fa]" />
        )}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN TABLE
   ═══════════════════════════════════════════════════════════════════ */
function TokenTable() {
  const { 
    pairs, loading, activeDex, activeFilter, activeTimeframe, 
    sortBy, sortDir, toggleSort, filters, visibleColumns, columnOrder 
  } = useMarketStore(
    useShallow(s => ({
      pairs: s.pairs,
      loading: s.loading,
      activeDex: s.activeDex,
      activeFilter: s.activeFilter,
      activeTimeframe: s.activeTimeframe,
      sortBy: s.sortBy,
      sortDir: s.sortDir,
      toggleSort: s.toggleSort,
      filters: s.filters,
      visibleColumns: s.visibleColumns,
      columnOrder: s.columnOrder
    }))
  );

  const parentRef  = useRef(null);

  // Compute dynamic grid Template
  const gridTemplate = useMemo(() => {
    const cols = ['minmax(240px, 1.5fr)'];
    columnOrder.forEach(id => {
      if (visibleColumns[id]) {
        switch (id) {
          case 'price': cols.push('95px'); break;
          case 'age': cols.push('60px'); break;
          case 'txns': cols.push('75px'); break;
          case 'volume': cols.push('85px'); break;
          case 'makers': cols.push('75px'); break;
          case 'c5m': 
          case 'c1h': 
          case 'c6h': 
          case 'c24h': cols.push('60px'); break;
          case 'liquidity': cols.push('85px'); break;
          case 'mcap': cols.push('95px'); break;
          default: break;
        }
      }
    });
    return cols.join(' ');
  }, [visibleColumns, columnOrder]);

  const filteredPairs = useMemo(() => {
    let list = [...pairs];
    
    // 1. DEX Matcher (Case-insensitive literal match)
    if (activeDex !== 'all') {
      list = list.filter(p => {
        const d = (p.dex || p.base_token_meta?.source || '').toLowerCase();
        return d.includes(activeDex.toLowerCase());
      });
    }

    // 2. Advanced Custom Filters (Min/Max)
    list = list.filter(p => {
      const getVal = (obj, key) => {
        let val = obj[key] !== undefined ? obj[key] : (obj.metrics && obj.metrics[key]);
        return Number(val) || 0;
      };

      // Simple Metrics
      if (filters.liquidity.min && p.liquidity < Number(filters.liquidity.min)) return false;
      if (filters.liquidity.max && p.liquidity > Number(filters.liquidity.max)) return false;
      if (filters.mcap.min && (p.mcap || p.fdv) < Number(filters.mcap.min)) return false;
      if (filters.mcap.max && (p.mcap || p.fdv) > Number(filters.mcap.max)) return false;
      if (filters.fdv.min && (p.fdv || p.mcap) < Number(filters.fdv.min)) return false;
      if (filters.fdv.max && (p.fdv || p.mcap) > Number(filters.fdv.max)) return false;

      // Timeframe Metrics (Iteration over t24h, t6h, t1h, t5m)
      const tfs = ['t24h', 't6h', 't1h', 't5m'];
      for (const tfKey of tfs) {
        const tf = filters[tfKey];
        const rawTf = tfKey.slice(1); // '24h', '6h', etc.

        // Mapping to pair object keys
        if (tf.txns.min && getVal(p, 'trade_count') < Number(tf.txns.min)) return false;
        if (tf.txns.max && getVal(p, 'trade_count') > Number(tf.txns.max)) return false;
        
        const volVal = getVal(p, `volume_${rawTf}`) || getVal(p, 'total_volume_usd');
        if (tf.volume.min && volVal < Number(tf.volume.min)) return false;
        if (tf.volume.max && volVal > Number(tf.volume.max)) return false;

        const changeVal = getVal(p, `change_${rawTf}`);
        if (tf.change.min && changeVal < Number(tf.change.min)) return false;
        if (tf.change.max && changeVal > Number(tf.change.max)) return false;
      }

      return true;
    });

    // 3. Map abstract RankBy Dropdown IDs to actual pair properties
    let effectiveSortBy = sortBy;
    if (sortBy.startsWith('trending_')) {
       effectiveSortBy = 'trade_count'; // Map generic trending to txns for now
    } else if (sortBy === 'fdv') {
       effectiveSortBy = 'mcap';        // FDV loosely maps to Market Cap
    }

    // Legacy macro-filter support (only applies if user never touched rank dropdown and it's on default)
    if (sortBy === 'total_volume_usd' && activeFilter !== 'top') {
      switch (activeFilter) {
        case 'trending': effectiveSortBy = 'trade_count'; break;
        case 'gainers':  effectiveSortBy = `change_${activeTimeframe}`; break;
        case 'new':      effectiveSortBy = 'created_at'; break;
        default:         break;
      }
    }

    // 3. Execution
    list.sort((a, b) => {
      // Date based sorting
      if (effectiveSortBy === 'last_trade_at' || effectiveSortBy === 'created_at') {
         const aTime = new Date(a.last_trade_at || a.created_at || a.block_time || 0).getTime();
         const bTime = new Date(b.last_trade_at || b.created_at || b.block_time || 0).getTime();
         return sortDir === 'desc' ? bTime - aTime : aTime - bTime;
      }

      // Safe numeric extraction with fallbacks
      const getVal = (obj, key) => {
         // If buy_count/sell_count aren't explicitly tracked from backend yet, fallback to trade_count
         if (key === 'buy_count' && obj.buy_count === undefined) return Number(obj.trade_count) || 0;
         if (key === 'sell_count' && obj.sell_count === undefined) return Number(obj.trade_count) || 0;
         
         // Fix for nested metrics object
         let val = obj[key] !== undefined ? obj[key] : (obj.metrics && obj.metrics[key]);
         return Number(val) || 0;
      };

      const aVal = getVal(a, effectiveSortBy);
      const bVal = getVal(b, effectiveSortBy);
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return list;
  }, [pairs, activeDex, activeFilter, activeTimeframe, sortBy, sortDir, filters]); // Added filters to deps

  // Ultra-fast virtualization logic
  const rowVirtualizer = useVirtualizer({
    count: filteredPairs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });

  return (
    <div className="token-table-container">
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="token-table-header-wrapper">
        <div className="token-table-header-grid" style={{ gridTemplateColumns: gridTemplate }}>
          {/* Note: TOKEN covers the rank section now */}
          <div className="token-table-header-cell text-left pl-[36px]">TOKEN</div>
          
          {columnOrder.map(id => {
            if (!visibleColumns[id]) return null;
            switch (id) {
              case 'price': return <SortHeader key={id} label="PRICE" field="price_usd" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              case 'age': return <SortHeader key={id} label="AGE" field="last_trade_at" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              case 'txns': return <SortHeader key={id} label="TXNS" field="txns_24h" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              case 'volume': return <SortHeader key={id} label="VOLUME" field="volume_24h" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              case 'makers': return <SortHeader key={id} label="MAKERS" field="makers_24h" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              case 'c5m': return <SortHeader key={id} label="5M" field="price_change_5m" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              case 'c1h': return <SortHeader key={id} label="1H" field="price_change_1h" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              case 'c6h': return <SortHeader key={id} label="6H" field="price_change_6h" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              case 'c24h': return <SortHeader key={id} label="24H" field="price_change_24h" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              case 'liquidity': return <SortHeader key={id} label="LIQUIDITY" field="liquidity_usd" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              case 'mcap': return <SortHeader key={id} label="MCAP" field="market_cap" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />;
              default: return null;
            }
          })}
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────── */}
      <div ref={parentRef} className="token-table-body-wrapper">
        <div className="token-table-body-inner">
          {loading ? (
            <div>
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="token-table-skeleton-row" style={{ gridTemplateColumns: gridTemplate, height: ROW_H }}>
                  <div className="px-3 flex items-center gap-2">
                    <div className="w-[20px] shrink-0"></div>
                    <div className="skeleton w-7 h-7 rounded-full shrink-0 ml-1" />
                    <div className="flex flex-col gap-1 w-full ml-1">
                       <div className="skeleton h-3 w-16 rounded-sm" />
                       <div className="skeleton h-2 w-[110px] rounded-sm" />
                    </div>
                  </div>
                  {columnOrder.map((id, j) => {
                    if (!visibleColumns[id]) return null;
                    return (
                      <div key={j} className="px-3 flex justify-end">
                        <div className="skeleton h-2.5 rounded-sm" style={{ width: 24 + Math.random() * 24 }} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : filteredPairs.length === 0 ? (
            <div className="token-table-empty">
              No pairs found — check backend connection
            </div>
          ) : (
            <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const pair = filteredPairs[vRow.index];
                return (
                  <TokenRow
                    key={pair.base_token + (pair.quote_token || '')}
                    pair={pair}
                    rank={vRow.index + 1}
                    visibleColumns={visibleColumns}
                    gridTemplate={gridTemplate}
                    columnOrder={columnOrder}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vRow.start}px)`,
                      height: vRow.size,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(TokenTable);
