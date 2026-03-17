// src/hooks/useWalletAuth.js — Wallet Authentication Hook
// ─────────────────────────────────────────────────────────────────────────────
// Watches wallet connection state from Solana Wallet Adapter.
// On connect: requests nonce → signs message → verifies with backend → stores JWT.
// On disconnect: clears auth session.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import useAuthStore from '../store/slices/useAuthStore';
import { API_BASE } from '../constants';

export function useWalletAuth() {
  const { connected, publicKey, signMessage, disconnect } = useWallet();
  const login    = useAuthStore((s) => s.login);
  const logout   = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user            = useAuthStore((s) => s.user);
  const isAuthenticating = useRef(false);
  const lastWallet      = useRef(null);

  const authenticateWallet = useCallback(async (walletAddress) => {
    if (!walletAddress || !signMessage || !connected || !publicKey) return;
    if (isAuthenticating.current || isAuthenticated) return;
    
    // Prevent double-auth for the exact same wallet immediately upon refresh
    if (lastWallet.current === walletAddress && isAuthenticated) return;
    
    isAuthenticating.current = true;

    try {
      // 1 fetch nonce
      const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${walletAddress}`);
      if (!nonceRes.ok) {
        throw new Error(`Failed to get nonce: ${nonceRes.status}`);
      }
      const { message } = await nonceRes.json();

      // 2 signMessage
      if (!connected || !publicKey) return;

      const encodedMessage = new TextEncoder().encode(message);
      let signatureBytes;
      try {
         signatureBytes = await signMessage(encodedMessage);
      } catch (signErr) {
         console.warn('[WalletAuth] User rejected signature or adapter failed:', signErr);
         disconnect();
         return;
      }

      // 3. Convert signature to base58 for transport
      const signatureB58 = bs58.encode(signatureBytes);

      // 4 verify-wallet
      const verifyRes = await fetch(`${API_BASE}/auth/verify-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          signature: signatureB58,
          message,
        }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        throw new Error(err.error || 'Verification failed');
      }

      // 5 login(authData)
      const authData = await verifyRes.json();
      login(authData);
      console.log('[WalletAuth] Authenticated ✓', walletAddress.slice(0, 8) + '...');

    } catch (err) {
      // User rejected signature or network error — wallet stays connected, auth fails gracefully
      if (err.message?.includes('User rejected')) {
        console.log('[WalletAuth] User rejected signature request');
      } else {
        console.warn('[WalletAuth] Auth error:', err);
      }
    } finally {
      isAuthenticating.current = false;
    }
  }, [signMessage, login, connected, publicKey, disconnect, isAuthenticated]);

  // Watch wallet connection state
  useEffect(() => {
    if (connected && publicKey && signMessage && !isAuthenticating.current && !isAuthenticated) {
      const walletAddress = publicKey.toBase58();
      
      if (lastWallet.current !== walletAddress) {
        lastWallet.current = walletAddress;
        authenticateWallet(walletAddress);
      }
    } else if (!connected && lastWallet.current) {
      // Wallet disconnected — clear auth ONLY if the user was logged in via THIS wallet
      const disconnectedWallet = lastWallet.current;
      lastWallet.current = null;
      isAuthenticating.current = false; // Reset lock explicitly
      
      if (isAuthenticated && user?.wallet_address === disconnectedWallet) {
        logout();
        console.log('[WalletAuth] Disconnected — session cleared');
      }
    }
  }, [connected, publicKey, signMessage, isAuthenticated, user, authenticateWallet, logout]);

  // Restore session on mount
  useEffect(() => {
    const store = useAuthStore.getState();
    if (!store.access_token && !store.refresh_token) return;
    setTimeout(() => {
      store.restoreSession();
    }, 50);
  }, []);

  return { isAuthenticated };
}

export default useWalletAuth;
