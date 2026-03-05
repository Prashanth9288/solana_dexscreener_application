/**
 * TradingChart.jsx — Production-grade Lightweight Charts renderer.
 *
 * Architecture:
 *   1. Chart is created once (useEffect with [] deps).
 *   2. Initial candle data is loaded via setData() when `candles` array changes.
 *   3. Real-time ticks call series.update(candle) — NEVER full setData().
 *   4. ResizeObserver keeps chart pixel-perfect inside resizable panels.
 *   5. Zustand `pushCandle` is subscribed via getState().subscribe() to bypass
 *      React render cycle entirely (zero re-renders per tick).
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { LineChart, Activity } from 'lucide-react';
import useChartStore from '../../store/slices/useChartStore';
import { TIMEFRAMES } from '../../constants';
import { CHART_LAYOUT_CONFIG, CANDLESTICK_SERIES_CONFIG, VOLUME_SERIES_CONFIG } from './chartConfig';
import '../../styles/chart/TradingChart.css';

function TradingChart() {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const candleRef    = useRef(null);
  const volumeRef    = useRef(null);
  const roRef        = useRef(null);
  // Track the last candle time to decide update vs. append
  const lastCandleTimeRef = useRef(null);
  // Track last candle count to know when setData is needed
  const lastCandleCountRef = useRef(0);

  const candles    = useChartStore((s) => s.candles);
  const timeframe  = useChartStore((s) => s.timeframe);
  const loading    = useChartStore((s) => s.loading);
  const setTimeframe = useChartStore((s) => s.setTimeframe);

  // ── 1. Initialize chart once ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_LAYOUT_CONFIG,
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const cs = chart.addSeries(CandlestickSeries, CANDLESTICK_SERIES_CONFIG);
    const vs = chart.addSeries(HistogramSeries,   VOLUME_SERIES_CONFIG);
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current  = chart;
    candleRef.current = cs;
    volumeRef.current = vs;

    // ── ResizeObserver — pixel-perfect with react-resizable-panels ──
    roRef.current = new ResizeObserver((entries) => {
      for (const { contentRect: { width, height } } of entries) {
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });
    roRef.current.observe(containerRef.current);

    // ── Subscribe to real-time candle pushes from Zustand (bypasses React render cycle) ──
    //    This is the ONLY place series.update() is called — not inside React renders.
    const unsubscribe = useChartStore.subscribe(
      (state) => state.candles,
      (candles) => {
        if (!candleRef.current || !volumeRef.current) return;
        if (candles.length === 0) return;

        const last = candles[candles.length - 1];
        const prevCount = lastCandleCountRef.current;

        if (prevCount > 0 && candles.length >= prevCount && last.time === lastCandleTimeRef.current) {
          // ✅ REAL-TIME UPDATE: only update the last candle (0 re-renders)
          try {
            candleRef.current.update({
              time: last.time, open: last.open, high: last.high, low: last.low, close: last.close,
            });
            volumeRef.current.update({
              time: last.time, value: last.volume ?? 0,
              color: last.close >= last.open ? '#22c55e30' : '#ef444430',
            });
          } catch { /* stale series ref — ignore */ }
        } else if (candles.length > 0) {
          // ✅ NEW CANDLE OR TIMEFRAME SWITCH: full setData (only on dataset change)
          try {
            candleRef.current.setData(candles.map((c) => ({
              time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
            })));
            volumeRef.current.setData(candles.map((c) => ({
              time: c.time, value: c.volume ?? 0,
              color: c.close >= c.open ? '#22c55e30' : '#ef444430',
            })));
            chart.timeScale().scrollToRealTime();
          } catch { /* chart may be disposed */ }

          lastCandleCountRef.current = candles.length;
        }

        lastCandleTimeRef.current  = last.time;
        lastCandleCountRef.current = candles.length;
      }
    );

    return () => {
      unsubscribe();
      roRef.current?.disconnect();
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
      volumeRef.current = null;
      lastCandleTimeRef.current  = null;
      lastCandleCountRef.current = 0;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Initial data load (candles populated by PairPage hydration) ─────────
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;
    if (candles.length === 0) return;

    // Only run setData on initial load (when chart has no data yet)
    if (lastCandleCountRef.current === 0) {
      try {
        candleRef.current.setData(candles.map((c) => ({
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
        })));
        volumeRef.current.setData(candles.map((c) => ({
          time: c.time, value: c.volume ?? 0,
          color: c.close >= c.open ? '#22c55e30' : '#ef444430',
        })));
        chartRef.current?.timeScale().scrollToRealTime();
        lastCandleCountRef.current = candles.length;
        lastCandleTimeRef.current  = candles[candles.length - 1].time;
      } catch { /* chart may not be ready */ }
    }
  }, [candles]);

  // ── 3. Timeframe switch: reset chart data ─────────────────────────────────
  useEffect(() => {
    lastCandleCountRef.current = 0;
    lastCandleTimeRef.current  = null;
  }, [timeframe]);

  const handleTf = useCallback((tf) => setTimeframe(tf), [setTimeframe]);

  return (
    <div className="chart-container-wrapper">

      {/* ── Timeframe + Toolbar Bar ── */}
      <div className="chart-timeframe-bar">
        {TIMEFRAMES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => handleTf(id)}
            className={`chart-timeframe-btn ${
              timeframe === id ? 'chart-timeframe-btn-active' : 'chart-timeframe-btn-inactive'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="chart-timeframe-spacer" />
        <div className="chart-toolbar-divider" />
        <div className="chart-toolbar-group">
          <button className="chart-toolbar-btn">
            <LineChart size={13} /> <span>Indicators</span>
          </button>
          <button className="chart-toolbar-text-btn chart-toolbar-btn-blue">Price / MCap</button>
          <button className="chart-toolbar-text-btn chart-toolbar-btn-blue">USD / SOL</button>
          <button className="chart-toolbar-btn">
            <Activity size={13} /> <span>Full</span>
          </button>
        </div>
      </div>

      {/* ── Chart Canvas ── */}
      <div className="chart-wrapper">
        {loading && candles.length === 0 && (
          <div className="chart-loading-overlay">
            <div className="chart-loading-spinner-wrapper">
              <div className="chart-loading-spinner" />
              <span className="chart-loading-text">Buffering Candlesticks…</span>
            </div>
          </div>
        )}
        <div ref={containerRef} className="chart-canvas-container" />
      </div>

    </div>
  );
}

export default React.memo(TradingChart);
