// src/store/slices/useAuthStore.js — Authentication State Management
// ─────────────────────────────────────────────────────────────────────────────
// Manages JWT tokens, user profile, session restoration, and logout.
// Persists tokens to localStorage for session survival across page reloads.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { API_BASE } from '../../constants';

const STORAGE_KEY_ACCESS  = 'dex_access_token';
const STORAGE_KEY_REFRESH = 'dex_refresh_token';
const STORAGE_KEY_USER    = 'dex_user';

const useAuthStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  accessToken:     null,
  refreshToken:    null,
  user:            null,
  isAuthenticated: false,
  isAuthLoading:   false,

  // ── Login — store tokens + user from API response ──────────────────────────
  login: (authResponse) => {
    const { access_token, refresh_token, user } = authResponse;

    try {
      localStorage.setItem(STORAGE_KEY_ACCESS, access_token);
      localStorage.setItem(STORAGE_KEY_REFRESH, refresh_token);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } catch { /* storage full or private mode */ }

    set({
      accessToken:     access_token,
      refreshToken:    refresh_token,
      user,
      isAuthenticated: true,
      isAuthLoading:   false,
    });
  },

  // ── Logout — clear everything ──────────────────────────────────────────────
  logout: async () => {
    const refreshToken = get().refreshToken;

    // Notify backend to invalidate refresh session
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch { /* best-effort */ }

    try {
      localStorage.removeItem(STORAGE_KEY_ACCESS);
      localStorage.removeItem(STORAGE_KEY_REFRESH);
      localStorage.removeItem(STORAGE_KEY_USER);
    } catch { /* ignore */ }

    set({
      accessToken:     null,
      refreshToken:    null,
      user:            null,
      isAuthenticated: false,
      isAuthLoading:   false,
    });
  },

  // ── Refresh — exchange refresh token for new access token ──────────────────
  refresh: async () => {
    const refreshToken = get().refreshToken;
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        get().logout();
        return false;
      }

      const data = await res.json();
      get().login(data);
      return true;
    } catch {
      get().logout();
      return false;
    }
  },

  // ── Restore session from localStorage on app load ──────────────────────────
  restoreSession: async () => {
    set({ isAuthLoading: true });

    try {
      const accessToken  = localStorage.getItem(STORAGE_KEY_ACCESS);
      const refreshToken = localStorage.getItem(STORAGE_KEY_REFRESH);
      const userStr      = localStorage.getItem(STORAGE_KEY_USER);

      if (!accessToken || !refreshToken) {
        set({ isAuthLoading: false });
        return;
      }

      const user = userStr ? JSON.parse(userStr) : null;

      // Set tokens first so the UI shows logged in
      set({
        accessToken,
        refreshToken,
        user,
        isAuthenticated: true,
      });

      // Verify token is still valid by hitting /me
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const { user: freshUser } = await res.json();
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(freshUser));
        set({ user: freshUser, isAuthLoading: false });
      } else if (res.status === 401) {
        // Access token expired — try refresh
        const refreshed = await get().refresh();
        if (!refreshed) {
          set({ isAuthLoading: false });
        }
      } else {
        set({ isAuthLoading: false });
      }
    } catch {
      set({ isAuthLoading: false });
    }
  },

  // ── Helper — get auth header for API calls ─────────────────────────────────
  getAuthHeader: () => {
    const token = get().accessToken;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  },

  setAuthLoading: (v) => set({ isAuthLoading: v }),
}));

export default useAuthStore;
