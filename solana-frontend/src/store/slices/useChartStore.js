/**
 * useChartStore.js — Production Chart State
 *
 * Uses subscribeWithSelector middleware so that TradingChart can subscribe
 * to candle updates without causing React re-renders (series.update() only).
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const useChartStore = create(
  subscribeWithSelector((set, get) => ({
    candles:   [],
    timeframe: '5m',
    loading:   true,

    setCandles: (candles) =>
      set({ candles: candles.slice(-2000), loading: false }),

    setTimeframe: (tf) =>
      set({ timeframe: tf, loading: true, candles: [] }),

    setLoading: (loading) => set({ loading }),

    /**
     * pushCandle — upsert a single real-time candle tick.
     *
     * Called by useTradeBatcher after each 100ms batch merge.
     * The TradingChart subscribes to `candles` changes via Zustand's
     * subscribeWithSelector to call series.update() WITHOUT triggering
     * any React re-renders.
     *
     * Returns the upserted candle (for direct series.update() usage if needed).
     */
    pushCandle: (candle) => {
      if (!candle) return null;
      let result = null;

      set((s) => {
        const arr  = [...s.candles];
        const last = arr.length > 0 ? arr[arr.length - 1] : null;

        if (last && last.time === candle.time) {
          // Update the live candle in-place
          const updated = {
            ...last,
            high:   Math.max(last.high, candle.high ?? candle.close),
            low:    Math.min(last.low,  candle.low  ?? candle.close),
            close:  candle.close,
            volume: (last.volume ?? 0) + (candle.volume ?? 0),
          };
          arr[arr.length - 1] = updated;
          result = updated;
          return { candles: arr };
        } else {
          // New candle bucket
          arr.push(candle);
          if (arr.length > 2000) arr.shift();
          result = candle;
          return { candles: arr };
        }
      });

      return result;
    },
  }))
);

export default useChartStore;
