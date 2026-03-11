// src/hooks/useWalletAuth.js — Wallet Authentication Hook
// ─────────────────────────────────────────────────────────────────────────────
// Watches wallet connection state from Solana Wallet Adapter.
// On connect: requests nonce → signs message → verifies with backend → stores JWT.
// On disconnect: clears auth session.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import useAuthStore from '../store/slices/useAuthStore';
import { API_BASE } from '../constants';

export function useWalletAuth() {
  const { connected, publicKey, signMessage, disconnect } = useWallet();
  const login    = useAuthStore((s) => s.login);
  const logout   = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authInProgress  = useRef(false);
  const lastWallet      = useRef(null);

  const authenticateWallet = useCallback(async (walletAddress) => {
    if (authInProgress.current) return;
    authInProgress.current = true;

    try {
      // 1. Request nonce from backend
      const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${walletAddress}`);
      if (!nonceRes.ok) {
        console.warn('[WalletAuth] Failed to get nonce:', nonceRes.status);
        return;
      }
      const { message } = await nonceRes.json();

      // 2. Ask wallet to sign the message
      if (!signMessage) {
        console.warn('[WalletAuth] Wallet does not support signMessage');
        return;
      }

      const encodedMessage = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(encodedMessage);

      // 3. Convert signature to base58 for transport
      // bs58 is already available from the wallet adapter dependencies
      const bs58 = await import('bs58');
      const signatureB58 = bs58.default.encode(signatureBytes);

      // 4. Send to backend for verification
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
        console.warn('[WalletAuth] Verification failed:', err.error || verifyRes.status);
        return;
      }

      const authData = await verifyRes.json();
      login(authData);
      console.log('[WalletAuth] Authenticated ✓', walletAddress.slice(0, 8) + '...');

    } catch (err) {
      // User rejected signature or network error — wallet stays connected, auth fails gracefully
      if (err.message?.includes('User rejected')) {
        console.log('[WalletAuth] User rejected signature request');
      } else {
        console.warn('[WalletAuth] Auth error:', err.message);
      }
    } finally {
      authInProgress.current = false;
    }
  }, [signMessage, login]);

  // Watch wallet connection state
  useEffect(() => {
    if (connected && publicKey) {
      const walletAddress = publicKey.toBase58();

      // Only authenticate if wallet changed (prevent re-auth on hot reload)
      if (lastWallet.current !== walletAddress && !isAuthenticated) {
        lastWallet.current = walletAddress;
        authenticateWallet(walletAddress);
      }
    } else if (!connected && lastWallet.current) {
      // Wallet disconnected — clear auth
      lastWallet.current = null;
      if (isAuthenticated) {
        logout();
        console.log('[WalletAuth] Disconnected — session cleared');
      }
    }
  }, [connected, publicKey, isAuthenticated, authenticateWallet, logout]);

  // Restore session on mount
  useEffect(() => {
    useAuthStore.getState().restoreSession();
  }, []);

  return { isAuthenticated };
}

export default useWalletAuth;
