import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;

  // Theme
  theme: 'light' | 'dark' | 'system';

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Default sidebar closed - will be shown on desktop via CSS md:translate-x-0
      sidebarOpen: false,
      sidebarCollapsed: false,
      theme: 'system',

      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (sidebarOpen) =>
        set({ sidebarOpen }),

      setSidebarCollapsed: (sidebarCollapsed) =>
        set({ sidebarCollapsed }),

      setTheme: (theme) =>
        set({ theme }),
    }),
    {
      name: 'reporivals-ui',
      storage: createJSONStorage(() => localStorage),
      // Don't persist sidebarOpen state - it should default to closed on mobile
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme
      }),
    }
  )
);
