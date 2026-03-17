import React from 'react';
import { Link } from 'react-router-dom';
import useAppStore from '../../store/slices/useAppStore';
import useAuthStore from '../../store/slices/useAuthStore';
import SearchBar from '../ui/SearchBar';
import WalletButton from '../ui/WalletButton';
import '../../styles/layout/TopNav.css';

function TopNav() {
  const backendOnline   = useAppStore((s) => s.backendOnline);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user            = useAuthStore((s) => s.user);
  const logout          = useAuthStore((s) => s.logout);

  return (
    <header className="topnav-header">
      {/* 1. Global Search Bar */}
      <div className="topnav-search-container">
         <SearchBar />
      </div>

      <div className="topnav-spacer" />

      {/* 2. Right side controls */}
      <div className="topnav-right-controls">
        {backendOnline !== null && (
          <div className={`pulse-dot ${backendOnline ? '' : 'pulse-dot--off'}`} />
        )}

        {/* Auth controls */}
        {isAuthenticated ? (
          <button
            onClick={logout}
            className="topnav-auth-btn"
            title={user?.email || 'Logged in'}
            style={{
              background: 'none', border: '1px solid #1e293b', borderRadius: 8,
              color: '#94a3b8', fontSize: 12, padding: '6px 12px', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'border-color 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.borderColor = '#334155'}
            onMouseLeave={(e) => e.target.style.borderColor = '#1e293b'}
          >
            {user?.email ? user.email.split('@')[0] : 'Account'} ✕
          </button>
        ) : (
          <Link
            to="/login"
            style={{
              color: '#94a3b8', fontSize: 12, padding: '6px 12px',
              border: '1px solid #1e293b', borderRadius: 8,
              textDecoration: 'none', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.target.style.borderColor = '#16c784'; e.target.style.color = '#16c784'; }}
            onMouseLeave={(e) => { e.target.style.borderColor = '#1e293b'; e.target.style.color = '#94a3b8'; }}
          >
            Login
          </Link>
        )}

        <WalletButton />
      </div>
    </header>
  );
}

export default React.memo(TopNav);

