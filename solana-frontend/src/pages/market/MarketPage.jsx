import React, { useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import useMarketStore from '../../store/slices/useMarketStore';
import useAppStore from '../../store/slices/useAppStore';
import { usePolling } from '../../hooks/usePolling';
import { getPairsV2, getTrending, getGainers, getNewPairs, getStats, getDexStats } from '../../services/api';
import { MARKET_POLL_INTERVAL } from '../../constants';
import MarketStats from '../../features/market/MarketStats';
import DexFilterTabs from '../../features/market/DexFilterTabs';
import TrendingTokens from '../../features/market/TrendingTokens';
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
  const activeFilter = useMarketStore((s) => s.activeFilter);
  const activeDex = useMarketStore((s) => s.activeDex);
  const sortBy = useMarketStore((s) => s.sortBy);
  const sortDir = useMarketStore((s) => s.sortDir);
  const abortRef = useRef(null);
  const [searchParams] = useSearchParams();

  // Read URL params to set initial filter on page load when navigating from sidebar
  useEffect(() => {
    const filterFromURL = searchParams.get('filter');
    if (filterFromURL && ['trending', 'top', 'gainers', 'new'].includes(filterFromURL)) {
      if (filterFromURL !== activeFilter) {
        useMarketStore.getState().setActiveFilter(filterFromURL);
      }
    }
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Pick the right API based on active filter
      let pairsFetcher;
      switch (activeFilter) {
        case 'trending':
          pairsFetcher = getTrending(100, controller.signal);
          break;
        case 'gainers':
          pairsFetcher = getGainers(100, controller.signal);
          break;
        case 'new':
          pairsFetcher = getNewPairs(100, controller.signal);
          break;
        case 'top':
        default:
          pairsFetcher = getPairsV2(100, activeDex, sortBy, sortDir, controller.signal);
          break;
      }

      const [pairsRes, statsRes, dexRes] = await Promise.allSettled([
        pairsFetcher,
        getStats(controller.signal),
        getDexStats(20, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      // --- Pairs ---
      if (pairsRes.status === 'fulfilled') {
        const raw = pairsRes.value;
        const pairsData = Array.isArray(raw) ? raw : (raw?.data || []);
        setPairs(pairsData);
        setBackendOnline(true);
      } else {
        if (pairsRes.reason?.name === 'AbortError') return;
        console.warn('[MarketPage] pairs fetch failed:', pairsRes.reason?.message);
        setLoading(false);
        setBackendOnline(false);
      }

      // --- Stats ---
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
  }, [setPairs, setStats, setDexStats, setError, setLoading, setSolPrice, setBackendOnline, activeFilter, activeDex, sortBy, sortDir]);

  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  usePolling(fetchData, MARKET_POLL_INTERVAL);

  return (
    <div className="market-page-container">
      <ErrorBoundary name="MarketStats" fallback="Failed to load stats">
        <MarketStats />
      </ErrorBoundary>
      <ErrorBoundary name="TrendingTokens" fallback={null}>
        <TrendingTokens />
      </ErrorBoundary>
      <DexFilterTabs />
      <ErrorBoundary name="TokenTable" fallback="Failed to load pairs">
        <TokenTable />
      </ErrorBoundary>
    </div>
  );
}

export default MarketPage;
