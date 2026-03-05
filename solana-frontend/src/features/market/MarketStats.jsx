import React from 'react';
import useMarketStore from '../../store/slices/useMarketStore';
import { formatUSD, formatNumber } from '../../utils/formatters';
import '../../styles/market/MarketStats.css';

function MarketStats() {
  const stats = useMarketStore((s) => s.stats);

  const vol  = stats?.total_volume || stats?.volume_24h_usd || stats?.total_volume_usd || 0;
  const txns = stats?.total_transactions || stats?.txns_24h || stats?.txns || 0;
  const blk  = stats?.latest_block || stats?.latestBlock || 0;

  return (
    <div className="market-stats-container">
      <div className="market-stats-wrapper">
        
        {/* 24H Volume Box */}
        <div className="market-stats-item">
          <span className="market-stats-label">24H Volume:</span>
          <span className="market-stats-value">{stats ? formatUSD(vol) : '—'}</span>
        </div>
        
        {/* 24H Txns Box */}
        <div className="market-stats-item">
          <span className="market-stats-label">24H Txns:</span>
          <span className="market-stats-value">{stats ? formatNumber(txns) : '—'}</span>
        </div>
        
        {/* Latest Block Box */}
        <div className="market-stats-item">
          <span className="market-stats-label">Latest Block:</span>
          <span className="market-stats-value">{blk ? formatNumber(blk, 0) : '—'}</span>
          <span className="market-stats-subtext">{blk ? '3s ago' : ''}</span>
        </div>
        
      </div>
    </div>
  );
}

export default React.memo(MarketStats);
