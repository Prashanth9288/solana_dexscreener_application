import React, { useState, useEffect } from 'react';
import TopNav from '../components/layout/TopNav';
import LeftSidebar from '../components/layout/LeftSidebar';
import NetworkBanner from '../components/ui/NetworkBanner';
import useAuthStore from '../store/slices/useAuthStore';
import useWatchlistStore from '../store/slices/useWatchlistStore';
import '../styles/layout/AppShell.css';

function AppShell({ children }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.access_token);
  const fetchWatchlists = useWatchlistStore((s) => s.fetchWatchlists);

  useEffect(() => {
    if (isAuthenticated && accessToken) fetchWatchlists();
  }, [isAuthenticated, accessToken, fetchWatchlists]);

  return (
    <div 
      className="app-shell-container"
      style={{ 
        gridTemplateColumns: `${sidebarExpanded ? '240px' : '56px'} 1fr`,
        gridTemplateAreas: '"sidebar navbar" "sidebar main"'
      }}
    >
      <NetworkBanner />
      
      <div className="app-shell-sidebar-wrapper">
        <LeftSidebar expanded={sidebarExpanded} setExpanded={setSidebarExpanded} />
      </div>
      
      <div className="app-shell-nav-wrapper">
        <TopNav sidebarExpanded={sidebarExpanded} setSidebarExpanded={setSidebarExpanded} />
      </div>
      
      <main className="app-shell-main-content">
        {children}
      </main>
    </div>
  );
}

export default AppShell;
