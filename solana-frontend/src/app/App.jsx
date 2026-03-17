import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import AppShell from '../layouts/AppShell';
import MarketPage from '../pages/market/MarketPage';
import WatchlistPage from '../pages/watchlist/WatchlistPage';
import PairPage from '../pages/pair/PairPage';
import AuthCallbackPage from '../pages/auth/AuthCallbackPage';
import LoginPage from '../pages/auth/LoginPage';
import WalletContextProvider from '../providers/WalletContextProvider';

function App() {
  return (
    <WalletContextProvider>
      <Router>
        <Routes>
          {/* OAuth callback — isolated completely outside AppShell to prevent topnav auto-restore interference */}
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          
          <Route path="/*" element={
            <AppShell>
              <Routes>
                <Route path="/" element={<Navigate to="/market" replace />} />
                <Route path="/market" element={<MarketPage />} />
                <Route path="/watchlist" element={<WatchlistPage />} />
                <Route path="/pair/:address" element={<PairPage />} />
                <Route path="/login" element={<LoginPage />} />
              </Routes>
            </AppShell>
          } />
        </Routes>
      </Router>
    </WalletContextProvider>
  );
}

export default App;
