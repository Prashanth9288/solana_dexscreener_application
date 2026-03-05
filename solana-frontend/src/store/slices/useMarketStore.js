import { create } from 'zustand';

const useMarketStore = create((set, get) => ({
  // ── Core State ────────────────────────────────────────────────────────────
  pairs: [],
  stats: null,
  dexStats: [],
  loading: true,
  error: null,

  // ── Filters ───────────────────────────────────────────────────────────────
  activeDex: 'all',
  activeFilter: 'trending', // trending | top | gainers | new
  activeTimeframe: '24h',   // 5m | 1h | 6h | 24h
  sortBy: 'total_volume_usd',
  sortDir: 'desc',

  // ── Actions ───────────────────────────────────────────────────────────────
  setPairs: (pairs) => set({ pairs, loading: false, error: null }),

  // Patch a single pair in-place (for WebSocket updates)
  patchPair: (signature, updates) => {
    set((s) => {
      const idx = s.pairs.findIndex(p => p.base_token === signature || p.signature === signature);
      if (idx === -1) return s;
      const next = [...s.pairs];
      next[idx] = { ...next[idx], ...updates };
      return { pairs: next };
    });
  },

  setStats: (stats) => set({ stats }),
  setDexStats: (dexStats) => set({ dexStats }),

  // Filters
  setActiveDex: (dex) => set({ activeDex: dex }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setActiveTimeframe: (tf) => set({ activeTimeframe: tf }),

  // Sorting
  setSort: (sortBy, sortDir) => set({ sortBy, sortDir }),
  toggleSort: (col) => {
    const { sortBy, sortDir } = get();
    if (sortBy === col) {
      set({ sortDir: sortDir === 'desc' ? 'asc' : 'desc' });
    } else {
      set({ sortBy: col, sortDir: 'desc' });
    }
  },

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));

export default useMarketStore;
