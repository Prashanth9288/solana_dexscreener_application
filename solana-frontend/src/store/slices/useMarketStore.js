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
  activeFilter: 'top', // trending | top | gainers | new
  activeTimeframe: '24h',   // 5m | 1h | 6h | 24h
  sortBy: 'volume_24h',
  sortDir: 'desc',

  // ── Filters State ────────────────────────────────────────────────────────
  filters: {
    liquidity: { min: '', max: '' },
    mcap: { min: '', max: '' },
    fdv: { min: '', max: '' },
    pairAge: { min: '', max: '' },
    t24h: { txns: { min: '', max: '' }, buys: { min: '', max: '' }, sells: { min: '', max: '' }, volume: { min: '', max: '' }, change: { min: '', max: '' } },
    t6h: { txns: { min: '', max: '' }, buys: { min: '', max: '' }, sells: { min: '', max: '' }, volume: { min: '', max: '' }, change: { min: '', max: '' } },
    t1h: { txns: { min: '', max: '' }, buys: { min: '', max: '' }, sells: { min: '', max: '' }, volume: { min: '', max: '' }, change: { min: '', max: '' } },
    t5m: { txns: { min: '', max: '' }, buys: { min: '', max: '' }, sells: { min: '', max: '' }, volume: { min: '', max: '' }, change: { min: '', max: '' } },
  },

  // ── Column Visibility State ──────────────────────────────────────────────
  visibleColumns: {
    price: true,
    age: true,
    txns: true,
    volume: true,
    makers: true,
    c5m: true,
    c1h: true,
    c6h: true,
    c24h: true,
    liquidity: true,
    mcap: true,
  },
  columnOrder: ['price', 'age', 'txns', 'volume', 'makers', 'c5m', 'c1h', 'c6h', 'c24h', 'liquidity', 'mcap'],

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

  // Filters & Sorting Actions
  setActiveDex: (dex) => set({ activeDex: dex }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setActiveTimeframe: (tf) => set({ activeTimeframe: tf }),
  setFilters: (newFilters) => set((s) => ({ filters: { ...s.filters, ...newFilters } })),
  resetFilters: () => set({
    filters: {
      liquidity: { min: '', max: '' },
      mcap: { min: '', max: '' },
      fdv: { min: '', max: '' },
      pairAge: { min: '', max: '' },
      t24h: { txns: { min: '', max: '' }, buys: { min: '', max: '' }, sells: { min: '', max: '' }, volume: { min: '', max: '' }, change: { min: '', max: '' } },
      t6h: { txns: { min: '', max: '' }, buys: { min: '', max: '' }, sells: { min: '', max: '' }, volume: { min: '', max: '' }, change: { min: '', max: '' } },
      t1h: { txns: { min: '', max: '' }, buys: { min: '', max: '' }, sells: { min: '', max: '' }, volume: { min: '', max: '' }, change: { min: '', max: '' } },
      t5m: { txns: { min: '', max: '' }, buys: { min: '', max: '' }, sells: { min: '', max: '' }, volume: { min: '', max: '' }, change: { min: '', max: '' } },
    }
  }),
  setVisibleColumns: (cols) => set({ visibleColumns: cols }),
  setColumnOrder: (order) => set({ columnOrder: order }),
  resetVisibleColumns: () => set({
    visibleColumns: {
      price: true,
      age: true,
      txns: true,
      volume: true,
      makers: true,
      c5m: true,
      c1h: true,
      c6h: true,
      c24h: true,
      liquidity: true,
      mcap: true,
    },
    columnOrder: ['price', 'age', 'txns', 'volume', 'makers', 'c5m', 'c1h', 'c6h', 'c24h', 'liquidity', 'mcap']
  }),


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
