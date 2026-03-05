import React from 'react';
import usePairStore from '../../store/slices/usePairStore';
import { formatUSD, formatNumber, formatPercent } from '../../utils/formatters';
import { getDexColor } from '../../constants';
import { Twitter, Star, Bell, BadgeCheck } from 'lucide-react';
import '../../styles/pair/TokenPanel.css';

/* ── Metric Cell ────────────────────────────────────────────────────────── */
function MetricCell({ label, value, valueClass = "token-panel-metric-value-mono" }) {
  return (
    <div className="token-panel-metric-cell">
      <span className="token-panel-metric-label">{label}</span>
      <span className={valueClass}>{value || '—'}</span>
    </div>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────────── */
function TokenPanel() {
  const loading = usePairStore((s) => s.loading);
  const baseTokenMeta = usePairStore((s) => s.baseTokenMeta);
  const quoteTokenMeta = usePairStore((s) => s.quoteTokenMeta);
  const dex = usePairStore((s) => s.dex);
  const priceUsd = usePairStore((s) => s.priceUsd);
  
  const volume24h = usePairStore((s) => s.volume24h);
  const txns24h = usePairStore((s) => s.txns24h);
  const buys24h = usePairStore((s) => s.buys24h);
  const sells24h = usePairStore((s) => s.sells24h);
  
  const change5m = usePairStore((s) => s.change5m);
  const change1h = usePairStore((s) => s.change1h);
  const change6h = usePairStore((s) => s.change6h);
  const change24h = usePairStore((s) => s.change24h);

  if (loading) {
    return (
      <div className="token-panel-loading-container">
        <div className="token-panel-skeleton-line"></div>
      </div>
    );
  }

  const symbol = baseTokenMeta?.symbol || '???';
  const name = baseTokenMeta?.name || 'Unknown';
  const qSymbol = quoteTokenMeta?.symbol || 'SOL';
  const lockIcon = <BadgeCheck className="w-[10px] h-[10px] text-green-500 inline ml-1" />;

  // Buy/Sell Bar calculation
  const totalTx = buys24h + sells24h;
  const buyPct = totalTx > 0 ? (buys24h / totalTx) * 100 : 50;
  
  // Mock volumes based on txn ratio for visual completeness
  const buyVol = volume24h * (buyPct/100);
  const sellVol = volume24h - buyVol;

  return (
    <div className="token-panel-wrapper">
      
      {/* 1. Token Identity Header */}
      <div className="token-panel-identity-block">
        <div className="token-panel-title-row">
          <div className="token-panel-logo-container">
            {baseTokenMeta?.logoURI ? (
               <img src={baseTokenMeta.logoURI} alt="" className="w-full h-full object-cover" />
            ) : <span className="text-xs font-bold text-[#6b758c]">{symbol.slice(0,2)}</span>}
          </div>
          <span className="token-panel-title">{name}</span>
        </div>
        <div className="token-panel-route-row mt-1">
          <span className="token-panel-symbol">{symbol}</span>
          <span className="token-panel-qsymbol">/ {qSymbol}</span>
          <span className="text-[10px] text-[#8b99b0] mx-1">&gt;</span>
          <span className="text-[10px] font-medium text-[#8b99b0]">Solana</span>
          <span className="text-[10px] text-[#8b99b0] mx-1">&gt;</span>
          <span className="text-[10px] bg-[rgba(255,255,255,0.05)] px-1 py-[1px] rounded font-bold text-[#f0f3fa]">{dex || 'DEX'}</span>
        </div>
      </div>

      {/* 2. Banner Image */}
      <div className="token-panel-banner-container">
        {/* Placeholder banner representing "The One Piece" style artwork */}
        <div className="token-panel-banner-placeholder" style={{backgroundImage: 'url("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop")'}}></div>
        <button className="token-panel-social-btn">
          <Twitter className="w-3.5 h-3.5" /> Twitter
        </button>
      </div>

      {/* 3. Price Cards */}
      <div className="token-panel-price-cards">
        <div className="token-panel-price-col border-r border-[#1e2433]">
          <span className="text-[10px] text-[#8b99b0] font-bold tracking-wider mb-1">PRICE USD</span>
          <span className="text-xl font-mono font-bold text-[#f0f3fa]">
            {priceUsd ? formatUSD(priceUsd) : '—'}
          </span>
        </div>
        <div className="token-panel-price-col">
          <span className="text-[10px] text-[#8b99b0] font-bold tracking-wider mb-1">PRICE SOL</span>
          <span className="text-[14px] font-mono font-medium text-[#f0f3fa]">
             {(priceUsd && quoteTokenMeta?.priceUsd) ? formatNumber(priceUsd / quoteTokenMeta.priceUsd) : '—'} SOL
          </span>
        </div>
      </div>

      {/* 4. Liquidity / FDV / Market Cap */}
      <div className="token-panel-metrics-grid">
         <div className="token-panel-metric-cell">
           <span className="token-panel-metric-label">Liquidity</span>
           <span className="token-panel-metric-value-mono">{formatUSD(volume24h * 1.5)} {lockIcon}</span>
         </div>
         <div className="token-panel-metric-cell">
           <span className="token-panel-metric-label">FDV</span>
           <span className="token-panel-metric-value-mono">{formatUSD(volume24h * 12)}</span>
         </div>
         <div className="token-panel-metric-cell">
           <span className="token-panel-metric-label">Mkt Cap</span>
           <span className="token-panel-metric-value-mono">{formatUSD(volume24h * 10)}</span>
         </div>
      </div>

      {/* 5. Price Change Statistics */}
      <div className="grid grid-cols-4 bg-[#1e2433] gap-px border-b border-[#1e2433]">
        <MetricCell label="5m" value={`${change5m > 0 ? '+' : ''}${change5m || 0}%`} valueClass={change5m > 0 ? 'text-[#16c784] font-mono text-[11px] font-bold' : change5m < 0 ? 'text-[#ea3943] font-mono text-[11px] font-bold' : 'text-[#f0f3fa] font-mono text-[11px]'} />
        <MetricCell label="1h" value={`${change1h > 0 ? '+' : ''}${change1h || 0}%`} valueClass={change1h > 0 ? 'text-[#16c784] font-mono text-[11px] font-bold' : change1h < 0 ? 'text-[#ea3943] font-mono text-[11px] font-bold' : 'text-[#f0f3fa] font-mono text-[11px]'} />
        <MetricCell label="6h" value={`${change6h > 0 ? '+' : ''}${change6h || 0}%`} valueClass={change6h > 0 ? 'text-[#16c784] font-mono text-[11px] font-bold' : change6h < 0 ? 'text-[#ea3943] font-mono text-[11px] font-bold' : 'text-[#f0f3fa] font-mono text-[11px]'} />
        <MetricCell label="24h" value={`${change24h > 0 ? '+' : ''}${change24h || 0}%`} valueClass={change24h > 0 ? 'text-[#16c784] font-mono text-[11px] font-bold' : change24h < 0 ? 'text-[#ea3943] font-mono text-[11px] font-bold' : 'text-[#f0f3fa] font-mono text-[11px]'} />
      </div>

      {/* 6. Transaction Stats & Buy vs Sell bars */}
      <div className="token-panel-tx-stats p-3 bg-[#10141f]">
        <div className="flex justify-between mb-1.5">
          <div className="flex flex-col">
            <span className="text-[10px] text-[#8b99b0] font-bold uppercase tracking-wider">TXNS</span>
            <span className="text-[13px] font-mono font-bold text-[#f0f3fa]">{formatNumber(txns24h)}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-[#8b99b0] font-bold uppercase tracking-wider">BUYS</span>
            <span className="text-[13px] font-mono font-bold text-[#f0f3fa]">{formatNumber(buys24h)}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-[#8b99b0] font-bold uppercase tracking-wider">SELLS</span>
            <span className="text-[13px] font-mono font-bold text-[#f0f3fa]">{formatNumber(sells24h)}</span>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-[3px] flex gap-0.5 rounded-full overflow-hidden mt-1 mb-3">
          <div className="h-full bg-[#16c784]" style={{width: `${buyPct}%`}}></div>
          <div className="h-full bg-[#ea3943]" style={{width: `${100 - buyPct}%`}}></div>
        </div>

        <div className="flex justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-[#8b99b0] font-bold uppercase tracking-wider">VOLUME</span>
            <span className="text-[13px] font-mono font-bold text-[#f0f3fa]">{formatUSD(volume24h)}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-[#8b99b0] font-bold uppercase tracking-wider">BUY VOL</span>
            <span className="text-[13px] font-mono font-bold text-[#f0f3fa]">{formatUSD(buyVol)}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-[#8b99b0] font-bold uppercase tracking-wider">SELL VOL</span>
            <span className="text-[13px] font-mono font-bold text-[#f0f3fa]">{formatUSD(sellVol)}</span>
          </div>
        </div>
      </div>

      {/* 7. Watchlist/Alerts Controls */}
      <div className="flex gap-2 p-3 bg-[#10141f] border-y border-[#1e2433]">
         <div className="flex-1">
           <button className="w-full token-panel-action-btn hover:text-[#eab308] hover:border-[#eab308]/50"><Star className="w-3.5 h-3.5" /> Watchlist</button>
         </div>
         <div className="flex-1">
           <button className="w-full token-panel-action-btn hover:text-[#3b82f6] hover:border-[#3b82f6]/50"><Bell className="w-3.5 h-3.5" /> Alerts</button>
         </div>
      </div>

    </div>
  );
}

export default React.memo(TokenPanel);
