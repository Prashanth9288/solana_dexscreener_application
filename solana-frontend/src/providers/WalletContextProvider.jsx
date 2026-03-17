// src/providers/WalletContextProvider.jsx — Solana Wallet Adapter Provider
// ─────────────────────────────────────────────────────────────────────────────
// Provides ConnectionProvider + WalletProvider + WalletModalProvider
// to the entire app. Uses VITE_HELIUS_RPC_URL for production RPC.
//
// Structure supports future multi-chain nesting:
//   <WagmiProvider>        ← future EVM
//     <WalletContextProvider>  ← Solana (this file)
//       <App />
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';

function WalletContextProvider({ children }) {
  // Use Helius RPC from env; fall back to public RPC only if env is missing
  const endpoint = useMemo(() => {
    const heliusUrl = import.meta.env.VITE_HELIUS_RPC_URL;
    if (heliusUrl) return heliusUrl;
    console.warn('[WalletProvider] VITE_HELIUS_RPC_URL not set — using public RPC (rate-limited)');
    return clusterApiUrl('mainnet-beta');
  }, []);

  // Native Standard Wallet protocol natively discovers Phantom and Solflare
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default WalletContextProvider;
