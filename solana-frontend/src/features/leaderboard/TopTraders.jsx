import React, { useEffect, useState, useRef } from 'react';
import { Trophy } from 'lucide-react';
import usePairStore from '../../store/slices/usePairStore';
import { getTopTraders } from '../../services/api';
import { shortenAddress, formatUSD } from '../../utils/formatters';
import { SOLSCAN_ACCOUNT_URL } from '../../constants';
import { Skeleton } from '../../components/ui/Skeleton';
import '../../styles/leaderboard/TopTraders.css';

/**
 * TopTraders — Fetches exact high-volume traders from the DB.
 */
function TopTraders() {
  const baseToken = usePairStore((s) => s.baseToken);
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!baseToken) return;
    
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    getTopTraders(baseToken, 10, controller.signal)
      .then(res => {
        setLeaders(res.leaders || []);
        setLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error("Failed to load top traders", err);
          setLoading(false);
        }
      });

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [baseToken]);

  return (
    <div className="top-traders-container">
      <div className="top-traders-header">
        <Trophy className="w-3.5 h-3.5 text-yellow" />
        <span className="top-traders-title">Top Traders</span>
        <span className="top-traders-subtitle">by Vol</span>
      </div>

      {loading ? (
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
