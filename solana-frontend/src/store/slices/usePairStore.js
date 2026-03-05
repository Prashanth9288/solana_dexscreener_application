import { create } from 'zustand';
import { computePercentChange } from '../../utils/formatters';
import { findPriceAtOffset } from '../../utils/candles';

const useTradesForPairStore = create(() => ({ _trades: [] }));

const usePairStore = create((set, get) => ({
  pairAddress: null,
  baseToken: null,
  quoteToken: null,
  dex: null,
  baseTokenMeta: null,
  quoteTokenMeta: null,
  priceUsd: null,
  prevPriceUsd: null,
  volume24h: null,
  txns24h: 0,
  buys24h: 0,
  sells24h: 0,
  change5m: null,
  change1h: null,
  change6h: null,
  change24h: null,
  loading: true,
  error: null,

  setPairAddress: (addr) => set({ pairAddress: addr }),
  setTokens: (base, quote) => set({ baseToken: base, quoteToken: quote }),
  setDex: (dex) => set({ dex }),
  setTokenMeta: (baseMeta, quoteMeta) => set({ baseTokenMeta: baseMeta, quoteTokenMeta: quoteMeta }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),

  updatePrice: (newPrice) => {
    if (!newPrice) return;
    const prev = get().priceUsd;
    set({ priceUsd: Number(newPrice), prevPriceUsd: prev });
  },

  updateMetricsFromTrades: (trades) => {
    if (!trades || trades.length === 0) return;

    const latest = trades[0];
    const currentPrice = Number(latest.price_usd) || null;
    const prev = get().priceUsd;

    const price5mAgo = findPriceAtOffset(trades, 300);
    const price1hAgo = findPriceAtOffset(trades, 3600);
    const price6hAgo = findPriceAtOffset(trades, 21600);
    const price24hAgo = findPriceAtOffset(trades, 86400);

    const volume = trades.reduce((sum, t) => sum + (Number(t.usd_value) || 0), 0);
    const buys = trades.filter(t => t.swap_side === 'buy').length;
    const sells = trades.filter(t => t.swap_side === 'sell').length;

    set({
      priceUsd: currentPrice,
      prevPriceUsd: prev,
      volume24h: volume,
      txns24h: trades.length,
      buys24h: buys,
      sells24h: sells,
      change5m: computePercentChange(currentPrice, price5mAgo),
      change1h: computePercentChange(currentPrice, price1hAgo),
      change6h: computePercentChange(currentPrice, price6hAgo),
      change24h: computePercentChange(currentPrice, price24hAgo),
      loading: false,
    });
  },

  reset: () => set({
    pairAddress: null, baseToken: null, quoteToken: null, dex: null,
    baseTokenMeta: null, quoteTokenMeta: null,
    priceUsd: null, prevPriceUsd: null, volume24h: null,
    txns24h: 0, buys24h: 0, sells24h: 0,
    change5m: null, change1h: null, change6h: null, change24h: null,
    loading: true, error: null,
  }),
}));

export default usePairStore;
