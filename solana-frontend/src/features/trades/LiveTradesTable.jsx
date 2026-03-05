import React, { useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import useTradeStore from '../../store/slices/useTradeStore';
import { formatUSD, formatNumber, shortenAddress, timeAgo } from '../../utils/formatters';
import { SOLSCAN_TX_URL, SOLSCAN_ACCOUNT_URL } from '../../constants';
import { SkeletonRow } from '../../components/ui/Skeleton';
import { ExternalLink } from 'lucide-react';
import '../../styles/trades/LiveTradesTable.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'buys', label: 'Buys' },
  { id: 'sells', label: 'Sells' },
  { id: 'whales', label: '🐋 >$10K' },
];

const COLUMNS = [
  { id: 'date',   label: 'Date',   align: 'left' },
  { id: 'type',   label: 'Type',   align: 'left' },
  { id: 'usd',    label: 'USD',    align: 'right' },
  { id: 'amount', label: 'Amount', align: 'right' },
  { id: 'price',  label: 'Price',  align: 'right' },
  { id: 'maker',  label: 'Maker',  align: 'right' },
  { id: 'tx',     label: 'Tx',     align: 'center' },
];

/* ── Safelink Helper ─────────────────────────────────────────────────────── */
function getSafeSolscanTx(signature) {
  if (!signature) return null;
  // If backend mock generator used "mock_tx_"
  if (signature.startsWith('mock_tx_') || signature.length < 50) return null;
  return `${SOLSCAN_TX_URL}${signature}`;
}

/* ── Memoized Virtual Row ────────────────────────────────────────────────── */
const TradeRow = React.memo(function TradeRow({ trade, isNew, style }) {
  const isBuy = trade.swap_side === 'buy';
  const safeTxLink = getSafeSolscanTx(trade.signature);

  return (
    <div
      className={`trades-row ${isNew ? 'anim-fade-in' : ''}`}
      style={{ ...style, height: `${style.height}px` }}
    >
      {/* Side indicator + Date */}
      <div className="trades-row-cell-date">
        <div className={isBuy ? 'trades-row-indicator-buy' : 'trades-row-indicator-sell'} />
        <span className="trades-row-date">
          {timeAgo(trade.block_time)}
        </span>
      </div>

      {/* Type */}
      <div className="trades-row-cell-type">
        <span className={isBuy ? 'trades-row-type-buy' : 'trades-row-type-sell'}>
          {trade.swap_side || '—'}
        </span>
      </div>

      {/* USD */}
      <div className="trades-row-cell-usd">
        {formatUSD(trade.usd_value)}
      </div>

      {/* Token Amount */}
      <div className="trades-row-cell-amount">
        {formatNumber(trade.base_amount)}
      </div>

      {/* Price */}
      <div className="trades-row-cell-price">
        {formatUSD(trade.price_usd)}
      </div>

      {/* Maker */}
      <div className="trades-row-cell-maker">
        {trade.wallet ? (
          <a href={`${SOLSCAN_ACCOUNT_URL}${trade.wallet}`} target="_blank" rel="noopener noreferrer"
             className="trades-row-maker-link">
            {shortenAddress(trade.wallet, 4)}
          </a>
        ) : <span className="trades-row-maker-fallback">—</span>}
      </div>

      {/* TX Link */}
      <div className="trades-row-cell-tx">
        {safeTxLink ? (
          <a href={safeTxLink} target="_blank" rel="noopener noreferrer"
             title="View on Solscan"
             className="trades-row-tx-link">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span title="Simulated Transaction" className="trades-row-tx-simulated">
            SIM
          </span>
        )}
      </div>
    </div>
  );
}, (prev, next) => prev.trade.signature === next.trade.signature && prev.isNew === next.isNew);

/* ── Virtualized Table ───────────────────────────────────────────────────── */
function LiveTradesTable() {
  const trades = useTradeStore((s) => s.trades);
  const newSignatures = useTradeStore((s) => s.newSignatures);
  const filter = useTradeStore((s) => s.filter);
  const loading = useTradeStore((s) => s.loading);
  const setFilter = useTradeStore((s) => s.setFilter);

  const parentRef = useRef(null);

  const filteredTrades = useMemo(() => {
    let list = trades;
    if (filter === 'buys') list = list.filter(t => t.swap_side === 'buy');
    else if (filter === 'sells') list = list.filter(t => t.swap_side === 'sell');
    else if (filter === 'whales') list = list.filter(t => (Number(t.usd_value) || 0) > 10000);
    return list; // Virtualizer means we don't strictly need to slice anymore, but we can limit to 1000
  }, [trades, filter]);

  const rowVirtualizer = useVirtualizer({
    count: filteredTrades.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // Dense 36px row height for institutional feel
    overscan: 10,
  });

  const handleFilter = useCallback((id) => setFilter(id), [setFilter]);

  return (
    <div className="trades-table-container">
      {/* Filter bar */}
      <div className="trades-filter-bar">
        <div className="trades-filter-group">
          <span className="trades-filter-title">Trades</span>
          {FILTERS.map(({ id, label }) => (
            <button key={id} onClick={() => handleFilter(id)}
              className={`trades-filter-btn ${
                filter === id ? 'trades-filter-btn-active' : 'trades-filter-btn-inactive'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <span className="trades-count">{filteredTrades.length} rx</span>
      </div>

      {/* Header Row */}
      <div className="trades-header-row">
        {COLUMNS.map((col) => (
          <div key={col.id} className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}>
            <span className="trades-header-cell-label">{col.label}</span>
          </div>
        ))}
      </div>

      {/* Virtualized Body */}
      <div ref={parentRef} className="trades-body-wrapper">
        {loading && trades.length === 0 ? (
          <div className="w-full">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="trades-row-skeleton">
                <SkeletonRow columns={1} />
              </div>
            ))}
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="trades-body-empty">
            <span className="trades-body-empty-text">No trades matching filter.</span>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const trade = filteredTrades[virtualRow.index];
              return (
                <TradeRow
                  key={trade.signature || virtualRow.index}
                  trade={trade}
                  isNew={newSignatures.has(trade.signature)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    height: virtualRow.size,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(LiveTradesTable);
