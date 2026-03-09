import React, { useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import usePairStore from '../../store/slices/usePairStore';
import useTradeStore from '../../store/slices/useTradeStore';
import useChartStore from '../../store/slices/useChartStore';
import useAppStore from '../../store/slices/useAppStore';
import { usePolling } from '../../hooks/usePolling';
import { useWebSocket } from '../../hooks/useWebSocket';
import { getPairDetail, getTradesForToken, getOHLCVv2, getTokenMeta } from '../../services/api';
import { buildCandlesFromTrades } from '../../utils/candles';
import { TRADES_POLL_INTERVAL, SOL_MINT } from '../../constants';
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

  // Parse address — supports both "mint" and "base-quote" formats
  const parts = (address || '').split('-');
  const baseToken = parts[0] || address;
  const quoteToken = parts[1] || SOL_MINT; // Default to SOL as quote token

  // ── Initial Hydration ──────────────────────────────────────────────────────
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
        // Parallel fetch: pair detail, OHLCV, trades, token metadata
        const [pairRes, ohlcvRes, tradesRes, baseMetaRes, quoteMetaRes] = await Promise.allSettled([
          getPairDetail(baseToken, quoteToken, controller.signal),
          getOHLCVv2(baseToken, quoteToken, timeframe, 500, controller.signal),
          getTradesForToken(baseToken, 200, controller.signal),
          getTokenMeta(baseToken, controller.signal),
          quoteToken ? getTokenMeta(quoteToken, controller.signal) : Promise.resolve(null),
        ]);

        if (controller.signal.aborted) return;

        // ── Token Metadata ──
        const bm = baseMetaRes.status === 'fulfilled' ? baseMetaRes.value : null;
        const qm = quoteMetaRes.status === 'fulfilled' ? quoteMetaRes.value : null;
        setTokenMeta(bm, qm);

        // ── Pair Detail (from pre-computed pairs table) ──
        if (pairRes.status === 'fulfilled' && pairRes.value) {
          const pd = pairRes.value;
          if (pd.dex) setDex(pd.dex);
          if (pd.price_usd) updatePrice(pd.price_usd);
          // Set pair-level metadata from the pre-computed data
          if (pd.base_token_meta) setTokenMeta(pd.base_token_meta, pd.quote_token_meta || qm);
          useAppStore.getState().setBackendOnline(true);
        }

        // ── OHLCV Candles ──
        if (ohlcvRes.status === 'fulfilled' && ohlcvRes.value?.data?.length > 0) {
          setCandles(ohlcvRes.value.data);
        }

        // ── Trades ──
        if (tradesRes.status === 'fulfilled' && tradesRes.value?.data) {
          const trades = tradesRes.value.data;
          setTrades(trades);
          updateMetrics(trades);

          // If no OHLCV from server, build candles locally from trades
          if (!(ohlcvRes.status === 'fulfilled' && ohlcvRes.value?.data?.length > 0)) {
            const candles = buildCandlesFromTrades(trades, timeframe);
            setCandles(candles);
          }

          // Detect DEX from trades if not from pair detail
          if (trades[0]?.dex && !usePairStore.getState().dex) {
            setDex(trades[0].dex);
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

  // ── Timeframe change → re-fetch OHLCV from server ─────────────────────────
  useEffect(() => {
    const controller = new AbortController();

    async function refetchCandles() {
      setChartLoading(true);
      try {
        const ohlcv = await getOHLCVv2(baseToken, quoteToken, timeframe, 500, controller.signal);
        if (ohlcv?.data?.length > 0) {
          setCandles(ohlcv.data);
        } else {
          // Fallback to local candle building from trades
          const trades = useTradeStore.getState().trades;
          if (trades.length > 0) {
            const candles = buildCandlesFromTrades(trades, timeframe);
            setCandles(candles);
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          const trades = useTradeStore.getState().trades;
          if (trades.length > 0) {
            setCandles(buildCandlesFromTrades(trades, timeframe));
          }
        }
      } finally {
        setChartLoading(false);
      }
    }

    if (baseToken && quoteToken) {
      refetchCandles();
    }

    return () => controller.abort();
  }, [timeframe, baseToken, quoteToken, setCandles, setChartLoading]);

  // ── WebSocket real-time streaming ──────────────────────────────────────────
  const wsChannels = [
    baseToken  ? `trades:${baseToken}`  : null,
    quoteToken && quoteToken !== SOL_MINT ? `trades:${quoteToken}` : null,
  ].filter(Boolean);

  const queueTrade = useTradeBatcher(100);

  const handleWsTrade = useCallback((msg) => {
    queueTrade(msg);
  }, [queueTrade]);

  const { connected: wsConnected } = useWebSocket(wsChannels, handleWsTrade, wsChannels.length > 0);

  // ── HTTP Polling fallback (only when WS is disconnected) ──
  const poll = useCallback(async () => {
    try {
      const res = await getTradesForToken(baseToken, 50);
      if (res?.data?.length > 0) {
        addTrades(res.data);

        const latest = res.data[0];
        if (latest?.price_usd) updatePrice(latest.price_usd);

        const allTrades = useTradeStore.getState().trades;
        usePairStore.getState().updateMetricsFromTrades(allTrades);
      }
    } catch { /* silent during polling */ }
  }, [baseToken, addTrades, updatePrice]);

  usePolling(poll, TRADES_POLL_INTERVAL, !wsConnected);

  return (
    <div className="pair-page-container">
      
      {/* LEFT COLUMN: Header + Resizable Chart/Transactions */}
      <div className="pair-page-left-col">
        {/* HEADER AREA */}
        <div className="pair-page-header-area">
          <ErrorBoundary name="PairHeader" fallback="Failed to load header">
            <PairHeader />
          </ErrorBoundary>
        </div>

        {/* DRAGGABLE PANELS */}
        <div className="pair-page-panels-area">
          <PanelGroup orientation="vertical" style={{ height: '100%' }}>
            <Panel defaultSize={60} minSize={30}>
              <div className="pair-page-panel-inner">
                <ErrorBoundary name="TradingChart" fallback="Failed to load chart">
                  <TradingChart />
                </ErrorBoundary>
              </div>
            </Panel>
            
            <PanelResizeHandle className="pair-page-resize-handle" />
            
            <Panel defaultSize={40} minSize={20}>
              <div className="pair-page-panel-inner">
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
