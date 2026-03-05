import React, { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { shortenAddress } from '../../utils/formatters';
import '../../styles/ui/CopyAddress.css';

function CopyAddress({ address, shorten = true, chars = 4, className = '' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      const el = document.createElement('textarea');
      el.value = address;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  return (
    <button
      onClick={handleCopy}
      className={`copy-address-btn ${className}`}
      title={address}
    >
      <span>{shorten ? shortenAddress(address, chars) : address}</span>
      {copied
        ? <Check className="copy-address-icon-copied" />
        : <Copy className="copy-address-icon-default" />
      }
    </button>
  );
}

export default React.memo(CopyAddress);
