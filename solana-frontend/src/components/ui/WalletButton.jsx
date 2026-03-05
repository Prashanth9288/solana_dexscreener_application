import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Wallet, LogOut } from 'lucide-react';
import { shortenAddress } from '../../utils/formatters';
import '../../styles/ui/WalletButton.css';

function WalletButton() {
  const { connected, publicKey, connect, disconnect, select, wallets } = useWallet();

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
        <div className="wallet-btn-dot" />
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
