import React, { useState } from 'react';
import LiveTradesTable from './LiveTradesTable';
import TopTraders from '../leaderboard/TopTraders';
import { Menu, Trophy, Users, Diamond, Component } from 'lucide-react';
import '../../styles/trades/TransactionsPanel.css';

const TABS = [
  { id: 'txns', label: 'Transactions', icon: <Menu className="w-3.5 h-3.5" /> },
  { id: 'top_traders', label: 'Top Traders', icon: <Trophy className="w-3.5 h-3.5" /> },
  { id: 'kols', label: 'KOLs', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'holders', label: 'Holders (4,142)', icon: <Diamond className="w-3.5 h-3.5" /> },
  { id: 'bubblemaps', label: 'Bubblemaps', icon: <Component className="w-3.5 h-3.5" /> }
];

function TransactionsPanel() {
  const [activeTab, setActiveTab] = useState('txns');

  return (
    <div className="tx-panel-wrapper">
      <div className="tx-panel-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tx-panel-tab ${activeTab === tab.id ? 'tx-panel-tab-active' : ''}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="tx-panel-content">
        {activeTab === 'txns' && <LiveTradesTable />}
        {activeTab === 'top_traders' && <TopTraders />}
        {['kols', 'holders', 'bubblemaps'].includes(activeTab) && (
          <div className="tx-panel-placeholder">
            <span className="tx-panel-placeholder-text">Fetching live backend data for {TABS.find(t => t.id === activeTab).label}...</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(TransactionsPanel);
