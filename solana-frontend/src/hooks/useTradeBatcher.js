import { useEffect, useRef, useCallback } from 'react';
import useTradeStore from '../store/slices/useTradeStore';
import usePairStore from '../store/slices/usePairStore';
import useChartStore from '../store/slices/useChartStore';
import { mergeTradeBatch } from '../services/chart/candleAggregator';

/**
 * useTradeBatcher — Production-grade high-frequency trade buffer.
 *
 * Architecture:
 *   WebSocket Trade Events
 *     → in-memory buffer (zero React renders)
 *     → 100ms setInterval flush
 *     → batch push to useTradeStore (deduped, max 5000 rows)
 *     → batch merge into OHLC candles via candleAggregator
 *     → push updatedCandle to useChartStore for chart.update()
 *
 * This entirely eliminates render thrashing on 100k+ trades/min.
 */
export function useTradeBatcher(flushMs = 100) {
  const bufferRef = useRef([]);
  const timerRef  = useRef(null);

  const addTrades    = useTradeStore((s) => s.addTrades);
  const updatePrice  = usePairStore((s) => s.updatePrice);
  const updateMetrics = usePairStore((s) => s.updateMetricsFromTrades);
  const pushCandle   = useChartStore((s) => s.pushCandle);

  const flush = useCallback(() => {
    if (bufferRef.current.length === 0) return;

    // 1. Snapshot + clear buffer atomically
    const batch = bufferRef.current.splice(0);

    // 2. Dedupe + push trades to store (max 5000 rows for virtualized table)
    addTrades(batch);

    // 3. Update price + aggregate metrics
    const latest = batch[batch.length - 1];
    if (latest?.price_usd) updatePrice(latest.price_usd);

    const allTrades = useTradeStore.getState().trades;
    updateMetrics(allTrades);

    // 4. Merge batch into OHLC candles (only update last candle, never full re-render)
    const { candles: currentCandles, timeframe } = useChartStore.getState();
    const { candles: updatedCandles, updatedCandle } = mergeTradeBatch(
      currentCandles,
      batch,
      timeframe
    );

    // 5. Push candle to store — store handles upsert logic
    if (updatedCandle) {
      // Update the store's candle array directly (avoids double-trigger)
      useChartStore.setState({ candles: updatedCandles });
      // pushCandle signals chart to call series.update(candle) — NOT setData()
      pushCandle(updatedCandle);
    }
  }, [addTrades, updatePrice, updateMetrics, pushCandle]);

  const queueTrade = useCallback((msg) => {
    if (!msg) return;
    // Support both { data: trade } and { data: [trade, ...] } shapes
    const incoming = Array.isArray(msg.data)
      ? msg.data
      : msg.data
        ? [msg.data]
        : Array.isArray(msg)
          ? msg
          : [msg];
    bufferRef.current.push(...incoming);
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(flush, flushMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      flush(); // drain buffer on unmount
    };
  }, [flush, flushMs]);

  return queueTrade;
}
