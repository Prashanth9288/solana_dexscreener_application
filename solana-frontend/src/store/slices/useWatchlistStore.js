// src/store/slices/useWatchlistStore.js
// ─────────────────────────────────────────────────────────────────────────────
// Professional Zustand store for Multi-Watchlists, Alerts, and reordering.
// Handles multi-folder logic and high-frequency optimistic UI updates.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import useAuthStore from './useAuthStore';
import { API_BASE } from '../../constants';

const useWatchlistStore = create((set, get) => ({
  watchlists: [],        // Folders: [{ id, name, created_at }]
  activeWatchlistId: null,
  items: [],            // Items for active folder: [{ id, token_address, network, pinned, position }]
  alerts: [],           // [{ id, token_address, price_target, direction }]
  favorites: new Set(), // Set of token_addresses (across all folders) for global Star state
  loading: false,
  error: null,
  hydrated: false,

  /**
   * ── FETCHING ──
   */

  fetchWatchlists: async () => {
    const authStore = useAuthStore.getState();
    if (!authStore.isAuthenticated || !authStore.access_token) return;

    set({ loading: true });
    try {
      // 1. Fetch Folders
      const wRes = await fetch(`${API_BASE}/watchlist`, {
        headers: { 'Authorization': `Bearer ${authStore.access_token}` }
      });
      const watchlists = await wRes.json();
      
      let activeId = get().activeWatchlistId || watchlists[0]?.id;
      if (!watchlists.find(w => w.id === activeId) && watchlists.length > 0) {
        activeId = watchlists[0].id;
      }

      set({ watchlists, activeWatchlistId: activeId });

      // 2. Fetch ALL items to populate global favorites (for Market page stars)
      // This ensures stars are colored even if the token is in a non-active folder.
      const allFavs = new Set();
      for (const w of watchlists) {
        const iRes = await fetch(`${API_BASE}/watchlist/${w.id}/items`, {
          headers: { 'Authorization': `Bearer ${authStore.access_token}` }
        });
        const folderItems = await iRes.json();
        folderItems.forEach(it => allFavs.add(it.token_address));
        if (w.id === activeId) {
          set({ items: folderItems });
        }
      }

      // 3. Fetch Alerts
      await get().fetchAlerts();

      set({ favorites: allFavs, hydrated: true, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  fetchItems: async (watchlistId) => {
    const authStore = useAuthStore.getState();
    try {
      const res = await fetch(`${API_BASE}/watchlist/${watchlistId}/items`, {
        headers: { 'Authorization': `Bearer ${authStore.access_token}` }
      });
      const items = await res.json();
      
      // Update global favorites Set (append new items)
      const currentFavs = new Set(get().favorites);
      items.forEach(it => currentFavs.add(it.token_address));

      set({ 
        items, 
        activeWatchlistId: watchlistId,
        favorites: currentFavs 
      });
    } catch (err) {
      console.error('Fetch items error:', err);
    }
  },

  fetchAlerts: async () => {
    const authStore = useAuthStore.getState();
    try {
      const res = await fetch(`${API_BASE}/watchlist/alerts/all`, {
        headers: { 'Authorization': `Bearer ${authStore.access_token}` }
      });
      const alerts = await res.json();
      set({ alerts });
    } catch (err) {
      console.error('Fetch alerts error:', err);
    }
  },

  setActiveWatchlist: async (id) => {
    set({ loading: true });
    await get().fetchItems(id);
    set({ loading: false });
  },

  /**
   * ── FOLDER MUTATIONS ──
   */

  createWatchlist: async (name) => {
    const authStore = useAuthStore.getState();
    try {
      const res = await fetch(`${API_BASE}/watchlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.access_token}`
        },
        body: JSON.stringify({ name })
      });
      const newList = await res.json();
      set(s => ({ watchlists: [...s.watchlists, newList] }));
      return newList;
    } catch (err) {
      console.error('Create list error:', err);
    }
  },

  /**
   * ── ITEM MUTATIONS ──
   */

  toggleStar: async (tokenAddress, watchlistId = null) => {
    const authStore = useAuthStore.getState();
    if (!authStore.isAuthenticated) return;

    const targetListId = watchlistId || get().activeWatchlistId;
    if (!targetListId) return;

    const { items, favorites } = get();
    const isAlreadyInCurrent = items.some(it => it.token_address === tokenAddress);

    // Optimistic Update
    const prevItems = [...items];
    const prevFavs = new Set(favorites);

    if (isAlreadyInCurrent) {
      // Remove from current UI view
      set({ 
        items: items.filter(it => it.token_address !== tokenAddress),
        // We only remove from favorites if it's the active view being toggled.
        // Theoretically it could be in another list, but usually clicking a filled star means "remove".
        favorites: new Set([...favorites].filter(f => f !== tokenAddress))
      });
    } else {
      set({ 
        items: [{ token_address: tokenAddress, pinned: false, position: 0 }, ...items],
        favorites: new Set([...favorites, tokenAddress])
      });
    }

    try {
      if (isAlreadyInCurrent) {
        await fetch(`${API_BASE}/watchlist/${targetListId}/items/${tokenAddress}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authStore.access_token}` }
        });
      } else {
        await fetch(`${API_BASE}/watchlist/${targetListId}/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authStore.access_token}`
          },
          body: JSON.stringify({ token_address: tokenAddress })
        });
      }
    } catch (err) {
      set({ items: prevItems, favorites: prevFavs });
    }
  },

  reorderItems: async (newItems) => {
    const { activeWatchlistId } = get();
    const authStore = useAuthStore.getState();
    const prevItems = get().items;

    // Map positions correctly
    const mappedItems = newItems.map((it, idx) => ({ ...it, position: idx }));
    set({ items: mappedItems });

    try {
      await fetch(`${API_BASE}/watchlist/${activeWatchlistId}/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.access_token}`
        },
        body: JSON.stringify({ items: mappedItems.map(it => ({ token_address: it.token_address, position: it.position })) })
      });
    } catch (err) {
      set({ items: prevItems });
    }
  },

  togglePin: async (tokenAddress, pinned) => {
    const { activeWatchlistId, items } = get();
    const authStore = useAuthStore.getState();
    const prevItems = [...items];

    set({
      items: items.map(it => it.token_address === tokenAddress ? { ...it, pinned } : it)
    });

    try {
      await fetch(`${API_BASE}/watchlist/${activeWatchlistId}/pin/${tokenAddress}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.access_token}`
        },
        body: JSON.stringify({ pinned })
      });
    } catch (err) {
      set({ items: prevItems });
    }
  },

  /**
   * ── ALERT MUTATIONS ──
   */
  addAlert: async (alertData) => {
    const authStore = useAuthStore.getState();
    try {
      const res = await fetch(`${API_BASE}/watchlist/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.access_token}`
        },
        body: JSON.stringify(alertData)
      });
      const newAlert = await res.json();
      set(s => ({ alerts: [...s.alerts, newAlert] }));
    } catch (err) {
      console.error('Add alert error:', err);
    }
  },

  removeAlert: async (alertId) => {
    const authStore = useAuthStore.getState();
    set(s => ({ alerts: s.alerts.filter(a => a.id !== alertId) }));
    try {
      await fetch(`${API_BASE}/watchlist/alerts/${alertId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authStore.access_token}` }
      });
    } catch (err) {
      console.error('Delete alert error:', err);
    }
  },

  clearWatchlist: () => {
    set({ 
      watchlists: [], 
      items: [], 
      alerts: [], 
      favorites: new Set(), 
      activeWatchlistId: null, 
      hydrated: false 
    });
  }
}));

export default useWatchlistStore;

