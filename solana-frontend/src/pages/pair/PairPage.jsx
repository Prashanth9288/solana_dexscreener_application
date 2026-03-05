import React, { useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import usePairStore from '../../store/slices/usePairStore';
import useTradeStore from '../../store/slices/useTradeStore';
import useChartStore from '../../store/slices/useChartStore';
import { usePolling } from '../../hooks/usePolling';
import { useWebSocket } from '../../hooks/useWebSocket';
import { getRecentTrades, getTokenMeta, getOHLCV } from '../../services/api';
import { buildCandlesFromTrades } from '../../utils/candles';
import { TRADES_POLL_INTERVAL } from '../../constants';
import { useTradeBatcher } from '../../hooks/useTradeBatcher';
import PairHeader from '../../features/pair/PairHeader';
import TokenPanel from '../../features/pair/TokenPanel';
import TradingChart from '../../features/chart/TradingChart';
import TransactionsPanel from '../../features/trades/TransactionsPanel';
import SwapModule from '../../features/swap/SwapModule';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import '../../styles/pair/PairPage.css';

function PairPage() {
  const { address } = useParams();
  const abortRef = useRef(null);

  const setPairAddress = usePairStore((s) => s.setPairAddress);
  const setTokens = usePairStore((s) => s.setTokens);
  const setDex = usePairStore((s) => s.setDex);
  const setTokenMeta = usePairStore((s) => s.setTokenMeta);
  const updateMetrics = usePairStore((s) => s.updateMetricsFromTrades);
  const updatePrice = usePairStore((s) => s.updatePrice);
  const setPairLoading = usePairStore((s) => s.setLoading);
  const reset = usePairStore((s) => s.reset);

  const setTrades = useTradeStore((s) => s.setTrades);
  const addTrades = useTradeStore((s) => s.addTrades);
  const clearTrades = useTradeStore((s) => s.clearTrades);

  const setCandles = useChartStore((s) => s.setCandles);
  const timeframe = useChartStore((s) => s.timeframe);
  const setChartLoading = useChartStore((s) => s.setLoading);

  const [baseToken, quoteToken] = (address || '').split('-');

  // Initial hydration
  useEffect(() => {
    reset();
    clearTrades();
    setPairAddress(address);
    setTokens(baseToken, quoteToken);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function hydrate() {
      try {
        // Fetch token metadata
        const [baseMeta, quoteMeta] = await Promise.allSettled([
          baseToken ? getTokenMeta(baseToken) : Promise.resolve(null),
          quoteToken ? getTokenMeta(quoteToken) : Promise.resolve(null),
        ]);

        if (controller.signal.aborted) return;

        const bm = baseMeta.status === 'fulfilled' ? baseMeta.value : null;
        const qm = quoteMeta.status === 'fulfilled' ? quoteMeta.value : null;
        setTokenMeta(bm, qm);

        // Try to detect DEX from token metadata
        if (bm?.source) setDex(bm.source);

        // Fetch trades
        const tradesRes = await getRecentTrades(200, controller.signal);
        if (controller.signal.aborted) return;

        if (tradesRes?.data) {
          const pairTrades = tradesRes.data.filter(
            t => (t.base_token === baseToken && t.quote_token === quoteToken) ||
                 (t.base_token === quoteToken && t.quote_token === baseToken)
          );
          const allTrades = pairTrades.length > 0 ? pairTrades : tradesRes.data;

          setTrades(allTrades);
          updateMetrics(allTrades);
          useAppStore.getState().setBackendOnline(true);

          // Detect DEX from trades if not from metadata
          if (allTrades[0]?.dex) setDex(allTrades[0].dex);

          // Try backend OHLCV first, fallback to local candle building
          try {
            const ohlcv = await getOHLCV(baseToken, quoteToken, timeframe, 500, controller.signal);
            if (ohlcv?.data?.length > 0) {
              setCandles(ohlcv.data);
            } else {
              const candles = buildCandlesFromTrades(allTrades, timeframe);
              setCandles(candles);
            }
          } catch {
            const candles = buildCandlesFromTrades(allTrades, timeframe);
            setCandles(candles);
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Pair hydration:', err);
          useAppStore.getState().setBackendOnline(false);
        }
      } finally {
        setPairLoading(false);
        setChartLoading(false);
      }
    }

    hydrate();

    return () => { controller.abort(); };
  }, [address, baseToken, quoteToken]);

  // Rebuild candles when timeframe changes (and we have trades)
  useEffect(() => {
    const trades = useTradeStore.getState().trades;
    if (trades.length > 0) {
      const candles = buildCandlesFromTrades(trades, timeframe);
      setCandles(candles);
    }
  }, [timeframe, setCandles]);

  // ── WebSocket real-time streaming ──
  // Subscribe to both token channels: trades fired on either side of the pair land here
  const wsChannels = [
    baseToken  ? `trades:${baseToken}`  : null,
    quoteToken ? `trades:${quoteToken}` : null,
  ].filter(Boolean);

  const queueTrade = useTradeBatcher(100); // 100ms throttle buffer

  const handleWsTrade = useCallback((msg) => {
    queueTrade(msg);
  }, [queueTrade]);

  const { connected: wsConnected } = useWebSocket(wsChannels, handleWsTrade, wsChannels.length > 0);

  // ── HTTP Polling fallback (only when WS is disconnected) ──
  const poll = useCallback(async () => {
    try {
      const res = await getRecentTrades(50);
      if (res?.data?.length > 0) {
        addTrades(res.data);

        const latest = res.data[0];
        if (latest?.price_usd) updatePrice(latest.price_usd);

        const allTrades = useTradeStore.getState().trades;
        usePairStore.getState().updateMetricsFromTrades(allTrades);
      }
    } catch { /* silent during polling */ }
  }, [addTrades, updatePrice]);

  usePolling(poll, TRADES_POLL_INTERVAL, !wsConnected);

  return (
    <div className="pair-page-container">
      
      {/* LEFT COLUMN: Header + Resizable Chart/Transactions */}
      <div className="pair-page-left-col">
        {/* HEADER AREA */}
        <div className="shrink-0 border-b border-[#1e2433] z-10 w-full">
          <ErrorBoundary name="PairHeader" fallback="Failed to load header">
            <PairHeader />
          </ErrorBoundary>
        </div>

        {/* DRAGGABLE PANELS */}
        <div className="flex-1 min-h-0 relative w-full">
          <PanelGroup orientation="vertical" style={{ height: '100%' }}>
            <Panel defaultSize={60} minSize={30}>
              <div className="w-full h-full border-r border-[#1e2433] flex flex-col relative min-h-0">
                <ErrorBoundary name="TradingChart" fallback="Failed to load chart">
                  <TradingChart />
                </ErrorBoundary>
              </div>
            </Panel>
            
            <PanelResizeHandle className="pair-page-resize-handle" />
            
            <Panel defaultSize={40} minSize={20}>
              <div className="w-full h-full border-r border-[#1e2433] flex flex-col relative min-h-0">
                <ErrorBoundary name="Transactions" fallback="Failed to load trades">
                  <TransactionsPanel />
                </ErrorBoundary>
              </div>
            </Panel>
          </PanelGroup>
        </div>
      </div>

      {/* RIGHT COLUMN: Token Panel + Swap */}
      <div className="pair-page-right-col">
        <ErrorBoundary name="TokenPanel" fallback="Failed to load panel">
          <TokenPanel />
        </ErrorBoundary>
        <ErrorBoundary name="SwapModule" fallback="Failed to load swap">
          <SwapModule />
        </ErrorBoundary>
      </div>

    </div>
  );
}

export default PairPage;
