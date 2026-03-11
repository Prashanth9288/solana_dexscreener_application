import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Wallet, LogOut, ShieldCheck } from 'lucide-react';
import { shortenAddress } from '../../utils/formatters';
import { useWalletAuth } from '../../hooks/useWalletAuth';
import useAuthStore from '../../store/slices/useAuthStore';
import '../../styles/ui/WalletButton.css';

function WalletButton() {
  const { connected, publicKey, connect, disconnect, select, wallets } = useWallet();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  /* WALLET AUTH START */
  useWalletAuth(); // Auto-triggers nonce → sign → verify on wallet connect
  /* WALLET AUTH END */

  const handleClick = async () => {
    if (connected) {
      await disconnect();
      return;
    }
    const phantom = wallets.find(w => w.adapter.name === 'Phantom');
    if (phantom) select(phantom.adapter.name);
    try { await connect(); } catch (err) { console.warn('Wallet:', err.message); }
  };

  if (connected && publicKey) {
    return (
      <button
        onClick={handleClick}
        className="wallet-btn-connected"
      >
        {isAuthenticated ? (
          <ShieldCheck className="wallet-btn-auth-icon" style={{ width: 14, height: 14, color: '#16c784' }} />
        ) : (
          <div className="wallet-btn-dot" />
        )}
        {shortenAddress(publicKey.toBase58(), 4)}
        <LogOut className="wallet-btn-logout-icon" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="wallet-btn-disconnected"
    >
      <Wallet className="wallet-btn-icon" />
      <span className="wallet-btn-text">Connect</span>
    </button>
  );
}

export default React.memo(WalletButton);
