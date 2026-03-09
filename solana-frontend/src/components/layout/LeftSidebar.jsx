import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Star, Bell, LayoutGrid, Zap, TrendingUp,
  Code2, Megaphone, ChevronDown, MonitorSmartphone,
  ChevronsLeft, ChevronsRight
} from 'lucide-react';
import '../../styles/layout/LeftSidebar.css';

import { SolanaIcon, BaseIcon, BSCIcon, EthereumIcon, PolygonIcon } from '../icons/ChainIcons';
import { LogoIcon, AppPromoAppleIcon, AppPromoAndroidIcon } from '../icons/PromoIcons';

/* ── Custom SVGs for Chains ── */
const CustomIcons = {
  Solana: SolanaIcon,
  Base: BaseIcon,
  BSC: BSCIcon,
  Ethereum: EthereumIcon,
  Polygon: PolygonIcon
};

const NAV_ITEMS = [
  { path: '/search', icon: Search, label: 'Search' },
  { path: '/watchlist', icon: Star, label: 'Watchlist' },
  { path: '/alerts', icon: Bell, label: 'Alerts' },
  { type: 'divider' },
  { path: '/multicharts', icon: LayoutGrid, label: 'Multicharts' },
  { type: 'divider' },
  { path: '/market?filter=new', icon: Zap, label: 'New Pairs' },
  { path: '/market?filter=gainers', icon: TrendingUp, label: 'Gainers & Losers' },
  { path: '/api', icon: Code2, label: 'API' },
  { path: '/advertise', icon: Megaphone, label: 'Advertise' },
];

const CHAINS = [
  { id: 'solana',   label: 'Solana',   active: true,  Icon: CustomIcons.Solana },
  { id: 'base',     label: 'Base',     active: false, Icon: CustomIcons.Base },
  { id: 'bsc',      label: 'BSC',      active: false, Icon: CustomIcons.BSCIcon || CustomIcons.BSC },
  { id: 'ethereum', label: 'Ethereum', active: false, Icon: CustomIcons.Ethereum },
  { id: 'polygon',  label: 'Polygon',  active: false, Icon: CustomIcons.Polygon },
];

function LeftSidebar({ expanded, setExpanded }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNav = useCallback((path) => {
    // If routing to market with a filter, we navigate to market and let MarketPage handle the query param,
    // or directly set the store here. For simplicity, we just use the store combined with navigate so it works instantly.
    if (path.startsWith('/market?filter=')) {
      const filter = path.split('=')[1];
      // Note: we'd ideally get setActiveFilter from a store hook here, but we can just use navigate
      // and MarketRoutes can parse it if needed. For now, since MarketPage reads activeFilter from store,
      // it's better to just navigate to /market and let the user handle filter via tabs.
      // Easiest robust fix: LeftSidebar shouldn't reinvent the wheel. Just go to /market.
      navigate('/market');
    } else {
      navigate(path);
    }
  }, [navigate]);

  return (
    <aside 
      className={`sidebar-container scrollbar-hide ${expanded ? 'expanded' : 'collapsed'}`}
    >
      {/* ── LOGO HEADER ── */}
      <div className={`sidebar-logo-header ${expanded ? 'expanded' : 'collapsed'}`}>
         <div className="sidebar-logo-icon">
           <LogoIcon />
         </div>
         {expanded && (
            <span className="sidebar-logo-text">
              DEXSCREENER
            </span>
         )}
      </div>

      {/* Get the App */}
      <div className={`sidebar-app-promo-wrapper ${expanded ? 'expanded' : 'collapsed'}`}>
        <div className={`sidebar-app-promo ${expanded ? 'expanded' : 'collapsed'}`}>
          {expanded && <span className="sidebar-app-promo-text">Get the App!</span>}
          <div className="sidebar-app-promo-icons">
            {expanded && <AppPromoAppleIcon />}
            <AppPromoAndroidIcon />
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className={`sidebar-nav ${expanded ? 'expanded' : 'collapsed'}`}>
        <button 
          onClick={() => setExpanded(!expanded)}
          className={`sidebar-nav-item ${expanded ? 'expanded' : 'collapsed'} inactive`}
          title={!expanded ? "Expand menu" : undefined}
          style={{ color: '#a9b1c2' }}
        >
          {expanded ? <ChevronsLeft className="sidebar-nav-icon" /> : <ChevronsRight className="sidebar-nav-icon" />}
          {expanded && <span>Collapse menu</span>}
        </button>
        
        {NAV_ITEMS.map((item, i) => {
          if (item.type === 'divider') return <div key={i} className="sidebar-divider" />;

          const Icon = item.icon;
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              title={!expanded ? item.label : undefined}
              className={`sidebar-nav-item ${expanded ? 'expanded' : 'collapsed'} ${active ? 'active' : 'inactive'}`}
            >
              <Icon className="sidebar-nav-icon" />
              {expanded && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      {/* Chains */}
      <div className={`sidebar-chains ${expanded ? 'expanded' : 'collapsed'}`}>
        {CHAINS.map(({ id, label, active, Icon }) => (
          <button
            key={id}
            disabled={!active}
            title={!expanded ? label : undefined}
            onClick={() => active && handleNav('/market')}
            className={`sidebar-chain-item ${expanded ? 'expanded' : 'collapsed'} ${active ? 'active' : 'inactive'}`}
          >
            <div className={`sidebar-chain-icon ${active ? 'active' : 'inactive'}`}><Icon /></div>
            {expanded && <span>{label}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar-flex-spacer" />
      
      {/* Watchlist Base */}
      <div className={`sidebar-watchlist ${expanded ? 'expanded' : 'collapsed'}`}>
        <div className={`sidebar-watchlist-header ${expanded ? 'expanded' : 'collapsed'}`}>
          <Star className="sidebar-watchlist-icon" />
          {expanded && <span className="sidebar-watchlist-title">Watchlist</span>}
        </div>
        {expanded && (
          <button className="sidebar-watchlist-btn">
            Main Watchlist
            <ChevronDown className="sidebar-watchlist-chevron" />
          </button>
        )}
      </div>
      
      {/* Settings / User footer */}
      <div 
        title={!expanded ? "Profile" : undefined}
        className={`sidebar-footer ${expanded ? 'expanded' : 'collapsed'}`}
      >
        <div className={`sidebar-user-avatar ${expanded ? 'expanded' : 'collapsed'}`}>
          <span className="sidebar-user-initial">U</span>
        </div>
        {expanded && (
          <>
            <span className="sidebar-user-name">upparapra...</span>
            <MonitorSmartphone className="sidebar-user-icon" />
          </>
        )}
      </div>
    </aside>
  );
}

export default React.memo(LeftSidebar);
