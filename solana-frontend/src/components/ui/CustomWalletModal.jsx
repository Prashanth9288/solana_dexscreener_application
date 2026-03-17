import React, { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { X } from 'lucide-react';
import useAuthStore from '../../store/slices/useAuthStore';
import '../../styles/ui/CustomWalletModal.css';

const CustomWalletModal = ({ isOpen, onClose }) => {
  const { select, wallets, publicKey, connecting, wallet: selectedWallet } = useWallet();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Close the modal automatically once we get a publicKey
  useEffect(() => {
    if (publicKey) {
      onClose();
    }
  }, [publicKey, onClose]);

  if (!isOpen) return null;

  const handleConnect = (walletName) => {
    select(walletName);
    setTimeout(() => onClose(), 150);
  };

  return (
    <div className="custom-wallet-modal-overlay">
      <div className="custom-wallet-modal">
        <button className="custom-wallet-modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        <h2 className="custom-wallet-modal-title">
          Connect a wallet on<br />Solana to continue
        </h2>
        
        <div className="custom-wallet-modal-list">
          {wallets.map((wallet) => (
            <button
              key={wallet.adapter.name}
              className="custom-wallet-modal-btn"
              onClick={() => handleConnect(wallet.adapter.name)}
            >
              <img 
                src={wallet.adapter.icon} 
                alt={`${wallet.adapter.name} icon`} 
                className="custom-wallet-modal-icon"
              />
              <span className="custom-wallet-modal-name">{wallet.adapter.name}</span>
              <span className="custom-wallet-modal-status">
                {connecting && selectedWallet?.adapter?.name === wallet.adapter.name 
                  ? 'Connecting...' 
                  : wallet.readyState === 'Installed' 
                    ? 'Detected' 
                    : ''}
              </span>
            </button>
          ))}
        </div>
        
        <div className="custom-wallet-modal-footer">
          Less options <span className="chevron-up">▲</span>
        </div>
      </div>
    </div>
  );
};

export default CustomWalletModal;
