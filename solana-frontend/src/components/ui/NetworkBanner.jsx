import React from 'react';
import useAppStore from '../../store/slices/useAppStore';
import { WifiOff } from 'lucide-react';
import '../../styles/ui/NetworkBanner.css';

function NetworkBanner() {
  const backendOnline = useAppStore((s) => s.backendOnline);

  if (backendOnline === null || backendOnline === true) return null;

  return (
    <div className="network-banner">
      <WifiOff className="network-banner-icon" />
      <span>Backend unavailable — data may be stale. Reconnecting...</span>
    </div>
  );
}

export default React.memo(NetworkBanner);
