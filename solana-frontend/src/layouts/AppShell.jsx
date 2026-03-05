import React, { useState } from 'react';
import TopNav from '../components/layout/TopNav';
import LeftSidebar from '../components/layout/LeftSidebar';
import NetworkBanner from '../components/ui/NetworkBanner';
import '../styles/layout/AppShell.css';

function AppShell({ children }) {
  // Mobile/desktop sidebar states
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  return (
    <div className="app-shell-container">
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
      
      {sidebarExpanded && (
        <div 
          className="app-shell-overlay"
          onClick={() => setSidebarExpanded(false)}
        />
      )}
    </div>
  );
}

export default AppShell;
