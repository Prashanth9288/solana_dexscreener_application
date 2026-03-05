import React from 'react';
import { useLocation } from 'react-router-dom';
import SwapModule from '../../features/swap/SwapModule';
import SecurityPanel from '../../features/security/SecurityPanel';
import TopTraders from '../../features/leaderboard/TopTraders';
import useAppStore from '../../store/slices/useAppStore';
import '../../styles/layout/RightSidebar.css';

function RightSidebar() {
  const location = useLocation();
  if (!location.pathname.startsWith('/pair/')) return null;

  return (
    <aside className="right-sidebar">
      <div className="right-sidebar-scroll-area">
        <SwapModule />
        <SecurityPanel />
        <TopTraders />
      </div>
    </aside>
  );
}

export default React.memo(RightSidebar);
