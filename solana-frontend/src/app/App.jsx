import React, { useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';

import AppShell from '../layouts/AppShell';
import MarketPage from '../pages/market/MarketPage';
import PairPage from '../pages/pair/PairPage';
import AuthCallbackPage from '../pages/auth/AuthCallbackPage';

function App() {
  const network = 'mainnet-beta';
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  // Wallets are auto-detected via Wallet Standard, explicit adapter array is deprecated

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <Router>
            <AppShell>
            <Routes>
                <Route path="/" element={<Navigate to="/market" replace />} />
                <Route path="/market" element={<MarketPage />} />
                <Route path="/pair/:address" element={<PairPage />} />
                {/* OAuth callback — outside AppShell layout */}
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
              </Routes>
            </AppShell>
          </Router>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
