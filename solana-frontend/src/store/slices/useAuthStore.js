// src/store/slices/useAuthStore.js — Authentication State Management
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { API_BASE } from '../../constants';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      access_token: null,
      refresh_token: null,
      isAuthenticated: false,

      login: (authResponse) => {
        set({
          access_token: authResponse.access_token,
          refresh_token: authResponse.refresh_token,
          user: authResponse.user,
          isAuthenticated: true,
        });
      },

      logout: async () => {
        const { refresh_token } = get();
        if (refresh_token) {
          try {
            await fetch(`${API_BASE}/auth/logout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token }),
            });
          } catch { /* ignore */ }
        }

        try {
          localStorage.removeItem('dex_access_token');
          localStorage.removeItem('dex_refresh_token');
          localStorage.removeItem('dex_user');
          // If using persist, clearing state below will auto-sync to 'auth'
        } catch {}

        set({
          user: null,
          access_token: null,
          refresh_token: null,
          isAuthenticated: false,
        });
      },

      refresh: async () => {
        const originalRefreshToken = get().refresh_token;
        if (!originalRefreshToken) return false;

        try {
          const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: originalRefreshToken }),
          });

          if (!res.ok) {
            // STOP THE 401 LOOP: if refresh fails once, clear the store instantly
            console.warn('[useAuthStore] Refresh failed. Clearing session.');
            get().logout();
            return false;
          }

          const data = await res.json();
          get().login(data);
          return true;
        } catch {
          // Network level failure — don't wipe session here, might just be offline
          return false;
        }
      },

      restoreSession: async () => {
        // Persist middleware automatically hydrates state synchronously.
        // We ALWAYS silently verify current status to ensure backend validity.
        const { access_token, refresh_token } = get();
        
        // GUARD: Never call /me if we don't have a token
        if (!access_token && !refresh_token) {
           get().logout();
           return;
        }

        try {
          const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${access_token}` },
          });

          if (res.ok) {
            const { user } = await res.json();
            set({ user, isAuthenticated: true });
          } else if (res.status === 401 && refresh_token) {
            // Only attempt refresh if we actually have a refresh token
            await get().refresh();
          } else {
             // Token invalid and no refresh possible -> clear
             get().logout();
          }
        } catch (err) {
           console.warn('[useAuthStore] restoreSession network error:', err);
        }
      },

      getAuthHeader: () => {
        const token = get().access_token;
        return token ? { 'Authorization': `Bearer ${token}` } : {};
      },
    }),
    {
      name: 'auth',
    }
  )
);

export default useAuthStore;
