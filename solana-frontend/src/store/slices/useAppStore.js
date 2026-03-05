import { create } from 'zustand';

const useAppStore = create((set, get) => ({
  // UI State
  sidebarExpanded: false,
  mobileSidebarOpen: false,
  searchQuery: '',

  // Network
  solPrice: null,
  backendOnline: null, // null = unknown, true = online, false = offline
  lastHealthCheck: null,

  // Actions
  setSidebarExpanded: (v) => set({ sidebarExpanded: v }),
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  toggleMobileSidebar: () => set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
  closeMobileSidebar: () => set({ mobileSidebarOpen: false }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSolPrice: (price) => set({ solPrice: price ? Number(price) : null }),
  setBackendOnline: (online) => set({ backendOnline: online, lastHealthCheck: Date.now() }),
}));

export default useAppStore;
