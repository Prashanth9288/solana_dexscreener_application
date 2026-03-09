import React, { useState } from 'react';
import TopNav from '../components/layout/TopNav';
import LeftSidebar from '../components/layout/LeftSidebar';
import NetworkBanner from '../components/ui/NetworkBanner';
import '../styles/layout/AppShell.css';

function AppShell({ children }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  return (
    <div 
      className="app-shell-container"
      style={{ gridTemplateColumns: `${sidebarExpanded ? '240px' : '56px'} 1fr` }}
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
