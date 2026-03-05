import React, { useEffect, useCallback, useRef } from 'react';
import useMarketStore from '../../store/slices/useMarketStore';
import useAppStore from '../../store/slices/useAppStore';
import { usePolling } from '../../hooks/usePolling';
import { getPairs, getStats, getDexStats } from '../../services/api';
import { MARKET_POLL_INTERVAL } from '../../constants';
import MarketStats from '../../features/market/MarketStats';
import DexFilterTabs from '../../features/market/DexFilterTabs';
import TokenTable from '../../features/market/TokenTable';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import '../../styles/market/MarketPage.css';

function MarketPage() {
  const setPairs = useMarketStore((s) => s.setPairs);
  const setStats = useMarketStore((s) => s.setStats);
  const setDexStats = useMarketStore((s) => s.setDexStats);
  const setError = useMarketStore((s) => s.setError);
  const setLoading = useMarketStore((s) => s.setLoading);
  const setSolPrice = useAppStore((s) => s.setSolPrice);
  const setBackendOnline = useAppStore((s) => s.setBackendOnline);
  const abortRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const [pairsRes, statsRes, dexRes] = await Promise.allSettled([
        getPairs(100, controller.signal),
        getStats(controller.signal),
        getDexStats(20, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      // --- Pairs ---
      // API returns { data: [...], count } for /analytics/pairs
      if (pairsRes.status === 'fulfilled') {
        const raw = pairsRes.value;
        // Handle both { data: [...] } and direct array
        const pairsData = Array.isArray(raw) ? raw : (raw?.data || []);
        if (pairsData.length > 0) {
          setPairs(pairsData);
          setBackendOnline(true);
        } else {
          // Got response but no data
          setPairs([]);
          setBackendOnline(true);
        }
      } else {
        console.warn('[MarketPage] pairs fetch failed:', pairsRes.reason?.message);
        setLoading(false);
        setBackendOnline(false);
      }

      // --- Stats ---
      // API returns a flat object for /analytics/stats (no .data wrapper)
      if (statsRes.status === 'fulfilled' && statsRes.value) {
        const s = statsRes.value;
        setStats(s);
        const price = s.sol_price || s.solPrice || s.sol_price_usd || null;
        if (price) setSolPrice(price);
      }

      // --- DEX Stats ---
      if (dexRes.status === 'fulfilled') {
        const raw = dexRes.value;
        const dexData = Array.isArray(raw) ? raw : (raw?.data || []);
        setDexStats(dexData);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[MarketPage] fetchData error:', err);
      setError(err.message);
      setBackendOnline(false);
    }
  }, [setPairs, setStats, setDexStats, setError, setLoading, setSolPrice, setBackendOnline]);

  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  usePolling(fetchData, MARKET_POLL_INTERVAL);

  return (
    <div className="market-page-container">
      <ErrorBoundary name="MarketStats" fallback="Failed to load stats">
        <MarketStats />
      </ErrorBoundary>
      <DexFilterTabs />
      <ErrorBoundary name="TokenTable" fallback="Failed to load pairs">
        <TokenTable />
      </ErrorBoundary>
    </div>
  );
}

export default MarketPage;
