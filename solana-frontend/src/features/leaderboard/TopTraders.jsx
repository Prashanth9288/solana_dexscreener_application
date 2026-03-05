import React, { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import useTradeStore from '../../store/slices/useTradeStore';
import { shortenAddress, formatUSD } from '../../utils/formatters';
import { SOLSCAN_ACCOUNT_URL } from '../../constants';
import { Skeleton } from '../../components/ui/Skeleton';
import '../../styles/leaderboard/TopTraders.css';

/**
 * TopTraders — derived from real trade data, no MOCK_TRADERS.
 * Aggregates trades by wallet and ranks by total volume.
 */
function TopTraders() {
  const trades = useTradeStore((s) => s.trades);
  const loading = useTradeStore((s) => s.loading);

  const leaders = useMemo(() => {
    if (!trades || trades.length === 0) return [];

    const walletMap = {};
    for (const t of trades) {
      if (!t.wallet) continue;
      if (!walletMap[t.wallet]) {
        walletMap[t.wallet] = { wallet: t.wallet, volume: 0, buys: 0, sells: 0, trades: 0 };
      }
      const entry = walletMap[t.wallet];
      entry.volume += Number(t.usd_value) || 0;
      entry.trades += 1;
      if (t.swap_side === 'buy') entry.buys += 1;
      else entry.sells += 1;
    }

    return Object.values(walletMap)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);
  }, [trades]);

  return (
    <div className="top-traders-container">
      <div className="top-traders-header">
        <Trophy className="w-3.5 h-3.5 text-yellow" />
        <span className="top-traders-title">Top Traders</span>
        <span className="top-traders-subtitle">by Vol</span>
      </div>

      {loading && trades.length === 0 ? (
        <div className="top-traders-loading">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height="20px" width="100%" />)}
        </div>
      ) : leaders.length === 0 ? (
        <div className="top-traders-empty">No trade data yet</div>
      ) : (
        <div className="top-traders-list-wrapper">
          {leaders.map((trader, i) => (
            <div key={trader.wallet} className="top-traders-list-item">
              <div className="top-traders-list-left">
                <span className={`top-traders-rank ${i < 3 ? 'top-traders-rank-top' : 'top-traders-rank-other'}`}>
                  {i + 1}
                </span>
                <a href={`${SOLSCAN_ACCOUNT_URL}${trader.wallet}`} target="_blank" rel="noopener noreferrer"
                   className="top-traders-wallet-link">
                  {shortenAddress(trader.wallet, 4)}
                </a>
              </div>
              <div className="top-traders-list-right">
                <span className="top-traders-volume">{formatUSD(trader.volume)}</span>
                <span className="top-traders-tx-count">{trader.trades}tx</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(TopTraders);
