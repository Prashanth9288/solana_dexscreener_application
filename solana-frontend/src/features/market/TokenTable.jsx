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
const COLS = 'minmax(240px, 1.5fr) 95px 60px 75px 85px 75px 60px 60px 60px 60px 85px 95px';
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
const TokenRow = React.memo(function TokenRow({ pair, rank, style }) {
  const navigate = useNavigate();
  const bm = pair.base_token_meta;
  const symbol = bm?.symbol || shortenAddress(pair.base_token, 3);
  const name   = bm?.name   || shortenAddress(pair.base_token);
  const logo   = bm?.logoURI;

  const handleClick = useCallback(() => {
    navigate(`/pair/${pair.base_token}-${pair.quote_token}`);
  }, [navigate, pair.base_token, pair.quote_token]);

  const c5m = pair.metrics?.change_5m ?? pair.change_5m ?? null;
  const c1h = pair.metrics?.change_1h ?? pair.change_1h ?? null;
  const c6h = pair.metrics?.change_6h ?? pair.change_6h ?? null;
  const c24h = pair.metrics?.change_24h ?? pair.change_24h ?? null; // explicitly adding 24H per 2nd image
  const age = formatAge(pair.created_at || pair.first_trade_at || pair.block_time);

  return (
    <div
      onClick={handleClick}
      className="token-table-row"
      style={{
        ...style,
        gridTemplateColumns: COLS,
      }}
    >
      {/* 1. Token cell (Includes Rank strictly inside it per 2nd image) */}
      <div className="token-table-cell-token">
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

      {/* 2. Price */}
      <div className="token-table-cell-price">{formatUSD(pair.avg_price_usd)}</div>
      
      {/* 3. Age */}
      <div className="token-table-cell-numeric">{age}</div>
      
      {/* 4. Txns */}
      <div className="token-table-cell-numeric">{formatNumber(pair.trade_count)}</div>
      
      {/* 5. Volume */}
      <div className="token-table-cell-numeric">{formatUSD(pair.total_volume_usd)}</div>
      
      {/* 6. Makers */}
      <div className="token-table-cell-numeric">{formatNumber(pair.unique_wallets || pair.maker_count || 0)}</div>
      
      {/* 7,8,9,10. Change Metrics (Added 24H) */}
      <div className="token-table-cell-change"><ChangeCell value={c5m} /></div>
      <div className="token-table-cell-change"><ChangeCell value={c1h} /></div>
      <div className="token-table-cell-change"><ChangeCell value={c6h} /></div>
      <div className="token-table-cell-change"><ChangeCell value={c24h} /></div>
      
      {/* 11. Liquidity */}
      <div className="token-table-cell-numeric">{pair.liquidity ? formatUSD(pair.liquidity) : '—'}</div>
      
      {/* 12. Mcap */}
      <div className="token-table-cell-numeric">{pair.mcap ? formatUSD(pair.mcap) : '—'}</div>
    </div>
  );
}, (prev, next) => {
  return prev.pair.base_token === next.pair.base_token
    && prev.pair.avg_price_usd === next.pair.avg_price_usd
    && prev.pair.trade_count === next.pair.trade_count
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
        {label === 'PRICE' ? <>{label} <span className="text-[9px] text-gray-500">💲</span></> : label}
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
  const { pairs, loading, activeDex, sortBy, sortDir, toggleSort } = useMarketStore(
    useShallow(s => ({
      pairs: s.pairs,
      loading: s.loading,
      activeDex: s.activeDex,
      sortBy: s.sortBy,
      sortDir: s.sortDir,
      toggleSort: s.toggleSort
    }))
  );

  const parentRef  = useRef(null);

  const filteredPairs = useMemo(() => {
    let list = [...pairs];
    if (activeDex !== 'all') {
      list = list.filter(p => {
        const d = (p.dex || p.base_token_meta?.source || '').toLowerCase();
        return d.includes(activeDex.toLowerCase());
      });
    }
    list.sort((a, b) => {
      const aVal = Number(a[sortBy]) || 0;
      const bVal = Number(b[sortBy]) || 0;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return list;
  }, [pairs, activeDex, sortBy, sortDir]);

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
        <div className="token-table-header-grid" style={{ gridTemplateColumns: COLS }}>
          {/* Note: TOKEN covers the rank section now */}
          <div className="token-table-header-cell text-left pl-[36px]">TOKEN</div>
          <SortHeader label="PRICE"  field="avg_price_usd"   sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />
          <SortHeader label="AGE"    field="created_at"       sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />
          <SortHeader label="TXNS"   field="trade_count"      sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />
          <SortHeader label="VOLUME" field="total_volume_usd" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />
          <SortHeader label="MAKERS" field="unique_wallets"   sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />
          
          <div className="token-table-header-cell text-right token-table-header-sortable" onClick={() => toggleSort('change_5m')}>5M</div>
          <div className="token-table-header-cell text-right token-table-header-sortable" onClick={() => toggleSort('change_1h')}>1H</div>
          <div className="token-table-header-cell text-right token-table-header-sortable" onClick={() => toggleSort('change_6h')}>6H</div>
          <div className="token-table-header-cell text-right token-table-header-sortable" onClick={() => toggleSort('change_24h')}>24H</div>
          
          <SortHeader label="LIQUIDITY"  field="liquidity" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />
          <SortHeader label="MCAP" field="mcap"      sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} />
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────── */}
      <div ref={parentRef} className="token-table-body-wrapper">
        <div className="token-table-body-inner">
          {loading ? (
            <div>
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="token-table-skeleton-row" style={{ gridTemplateColumns: COLS, height: ROW_H }}>
                  <div className="px-3 flex items-center gap-2">
                    <div className="w-[20px] shrink-0"></div>
                    <div className="skeleton w-7 h-7 rounded-full shrink-0 ml-1" />
                    <div className="flex flex-col gap-1 w-full ml-1">
                       <div className="skeleton h-3 w-16 rounded-sm" />
                       <div className="skeleton h-2 w-[110px] rounded-sm" />
                    </div>
                  </div>
                  {Array.from({ length: 11 }).map((_, j) => (
                    <div key={j} className="px-3 flex justify-end">
                      <div className="skeleton h-2.5 rounded-sm" style={{ width: 24 + Math.random() * 24 }} />
                    </div>
                  ))}
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
