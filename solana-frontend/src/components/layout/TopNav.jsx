import React from 'react';
import useAppStore from '../../store/slices/useAppStore';
import SearchBar from '../ui/SearchBar';
import WalletButton from '../ui/WalletButton';
import '../../styles/layout/TopNav.css';

function TopNav() {
  const backendOnline = useAppStore((s) => s.backendOnline);

  return (
    <header className="topnav-header">
      
      {/* 2. Global Search Bar */}
      <div className="topnav-search-container">
         <SearchBar />
      </div>

      <div className="topnav-spacer" />

      {/* 3. Right side controls */}
      <div className="topnav-right-controls">
        {backendOnline !== null && (
          <div className={`pulse-dot ${backendOnline ? '' : 'pulse-dot--off'}`} />
        )}
        <WalletButton />
      </div>
    </header>
  );
}

export default React.memo(TopNav);
