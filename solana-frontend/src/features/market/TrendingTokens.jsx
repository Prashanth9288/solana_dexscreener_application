import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useMarketStore from '../../store/slices/useMarketStore';
import { formatUSD, formatPercent } from '../../utils/formatters';
import { Sparklines, SparklinesLine, SparklinesSpots } from 'react-sparklines';
import '../../styles/market/TrendingTokens.css';

function TrendingTokens() {
  const trendingPairs = useMarketStore((s) => s.pairs); // MarketPage will fetch trending on first load
  const activeFilter = useMarketStore((s) => s.activeFilter);
  const navigate = useNavigate();
  const scrollRef = useRef(null);

  // Auto-scroll logic if desired, or simple drag-to-scroll
  // For now, pure CSS horizontal scroll with no scrollbars
  const displayPairs = activeFilter === 'trending' ? trendingPairs.slice(0, 15) : [];

  if (activeFilter !== 'trending' || !displayPairs.length) {
    return null;
  }

  // Generate a mock sparkline if no real history exists
  // In a real app we'd fetch this or derive from the 24h/6h/1h/5m data
  const generateSparkline = (current, change_24h) => {
    const points = [];
    const chg = change_24h || 0;
    const start = current / (1 + chg / 100);
    for (let i = 0; i < 20; i++) {
        // Simple interpolation with noise
        const progress = i / 19;
        const base = start + (current - start) * progress;
        const noise = (Math.random() - 0.5) * (current * 0.05);
        points.push(base + noise);
    }
    return points;
  };

  return (
    <div className="trending-tokens-container">
      <div className="trending-tokens-header">
        <span className="trending-title">🔥 Trending Tokens</span>
        <button className="trending-view-all">View All</button>
      </div>
      
      <div className="trending-scroll-area" ref={scrollRef}>
        {displayPairs.map((pair, idx) => {
          const isPositive = pair.price_change_24h >= 0;
          const sparklineData = generateSparkline(pair.price_usd, pair.price_change_24h);
          
          return (
            <div 
              key={pair.base_token} 
              className="trending-card"
              onClick={() => navigate(`/pair/${pair.base_token}`)}
            >
              <div className="trending-card-top">
                <span className="trending-rank">#{idx + 1}</span>
                <span className="trending-symbol">{pair.base_token_meta?.symbol || pair.base_token.slice(0, 4)}</span>
                <span className={`trending-change ${isPositive ? 'positive' : 'negative'}`}>
                  {formatPercent(pair.price_change_24h)}
                </span>
              </div>
              
              <div className="trending-card-middle">
                <span className="trending-price">{formatUSD(pair.price_usd, 6)}</span>
              </div>
              
              <div className="trending-card-chart">
                <Sparklines data={sparklineData} width={100} height={30} margin={2}>
                  <SparklinesLine color={isPositive ? '#00e676' : '#ff3b69'} style={{ strokeWidth: 2, fill: "none" }} />
                  <SparklinesSpots size={2} style={{ stroke: isPositive ? '#00e676' : '#ff3b69', strokeWidth: 2, fill: "white" }} />
                </Sparklines>
              </div>

              <div className="trending-card-bottom">
                <span className="trending-vol">Vol: {formatUSD(pair.volume_24h)}</span>
                <span className="trending-dex">{pair.dex || 'Raydium'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(TrendingTokens);
