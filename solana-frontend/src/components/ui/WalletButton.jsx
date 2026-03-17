import React, { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Wallet, LogOut, ShieldCheck } from 'lucide-react';
import { shortenAddress } from '../../utils/formatters';
import { useWalletAuth } from '../../hooks/useWalletAuth';
import useAuthStore from '../../store/slices/useAuthStore';
import CustomWalletModal from './CustomWalletModal';
import '../../styles/ui/WalletButton.css';

function WalletButton() {
  const { connected, publicKey, disconnect, wallet, connect, connecting } = useWallet();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  /* WALLET AUTH START */
  useWalletAuth(); // Auto-triggers nonce → sign → verify on wallet connect
  /* WALLET AUTH END */

  // Bind the Modal Provider's 'select' action to trigger the connection state securely
  useEffect(() => {
    if (wallet && !connected && !connecting) {
      connect().catch((err) => {
        if (!err.message?.includes('User rejected')) {
            console.warn('[WalletButton] Connection rejected or failed:', err);
        }
      });
    }
  }, [wallet, connected, connect, connecting]);

  const handleClick = async () => {
    if (connected) {
      await disconnect();
      return;
    }
    setIsModalOpen(true);
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
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {shortenAddress(publicKey.toBase58(), 4)}
        </span>
        <LogOut className="wallet-btn-logout-icon" />
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="wallet-btn-disconnected"
      >
        <Wallet className="wallet-btn-icon" />
        <span className="wallet-btn-text">Connect</span>
      </button>

      <CustomWalletModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
}

export default React.memo(WalletButton);
