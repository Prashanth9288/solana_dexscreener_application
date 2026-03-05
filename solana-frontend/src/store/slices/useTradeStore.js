/**
 * useTradeStore.js — Production Trade State
 *
 * Supports 5000 row virtualized table with O(1) deduplication.
 * New trades prepend to the list. Old trades are evicted past 5000.
 */

import { create } from 'zustand';

const MAX_TRADES = 5000;

const useTradeStore = create((set, get) => ({
  trades:        [],
  newSignatures: new Set(),  // Tracks "new" trades for flash animation
  filter:        'all',      // 'all' | 'buy' | 'sell'
  loading:       true,

  setTrades: (trades) => set({
    trades:        trades.slice(0, MAX_TRADES),
    loading:       false,
    newSignatures: new Set(),
  }),

  addTrades: (incoming) => {
    if (!incoming || incoming.length === 0) return;

    set((s) => {
      const existingSigs = new Set(s.trades.map((t) => t.signature));
      const fresh = incoming.filter(
        (t) => t.signature && !existingSigs.has(t.signature)
      );
      if (fresh.length === 0) return s;

      const freshSigs = new Set(fresh.map((t) => t.signature));
      const merged    = [...fresh, ...s.trades].slice(0, MAX_TRADES);

      return {
        trades:        merged,
        newSignatures: freshSigs,
        loading:       false,
      };
    });

    // Clear flash animation after 350ms
    setTimeout(() => {
      set({ newSignatures: new Set() });
    }, 350);
  },

  setFilter:   (filter) => set({ filter }),
  setLoading:  (loading) => set({ loading }),
  clearTrades: () => set({ trades: [], newSignatures: new Set(), loading: true }),

  isNewTrade: (signature) => get().newSignatures.has(signature),
}));

export default useTradeStore;
