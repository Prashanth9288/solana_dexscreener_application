import React from 'react';
import usePairStore from '../../store/slices/usePairStore';
import CopyAddress from '../../components/ui/CopyAddress';
import StarButton from '../../components/watchlist/StarButton';
import { ExternalLink, ChevronRight } from 'lucide-react';
import { SOLSCAN_ACCOUNT_URL, getDexColor } from '../../constants';
import '../../styles/pair/PairHeader.css';

function PairHeader() {
  const loading = usePairStore((s) => s.loading);
  const baseTokenMeta = usePairStore((s) => s.baseTokenMeta);
  const quoteTokenMeta = usePairStore((s) => s.quoteTokenMeta);
  const baseToken = usePairStore((s) => s.baseToken);
  const dex = usePairStore((s) => s.dex);

  if (loading) {
    return (
      <div className="pair-top-header-loading">
        <div className="pair-top-skeleton"></div>
      </div>
    );
  }

  const symbol = baseTokenMeta?.symbol || '???';
  const name = baseTokenMeta?.name || 'Unknown';
  const qSymbol = quoteTokenMeta?.symbol || 'SOL';
  const logo = baseTokenMeta?.logoURI;
  const dexColor = getDexColor(dex);

  return (
    <div className="pair-top-header">
      <div className="pair-top-identity">
        <div className="pair-top-logo-wrap">
          {logo ? (
            <img src={logo} alt="" className="pair-top-logo" onError={(e) => { e.target.style.display = 'none'; }} />
          ) : (
            <div className="pair-top-logo-fallback">{symbol.slice(0, 2)}</div>
          )}
        </div>
        
        <div className="pair-top-info-stack">
          {/* Top Row: ONE / SOL  TokenName */}
          <div className="pair-top-name-row">
            {baseToken && <StarButton tokenAddress={baseToken} />}
            <span className="pair-top-symbol">{symbol}</span>
            <span className="pair-top-qsymbol">/ {qSymbol}</span>
            <span className="pair-top-name-badge">{name}</span>
          </div>
          
          {/* Bottom Row: Solana > PumpSwap   [Address] [Link] */}
          <div className="pair-top-route-row">
            <img src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" alt="SOL" className="w-3 h-3 rounded-full" />
            <span className="pair-top-network">Solana</span>
            <ChevronRight className="w-3 h-3 text-[#6b758c]" />
            {dex && (
              <span className="pair-top-dex-source" style={{ color: dexColor }}>
                {dex}
              </span>
            )}
            
            <div className="pair-top-divider" />
            
            {baseToken && <CopyAddress address={baseToken} chars={6} />}
            <a href={`${SOLSCAN_ACCOUNT_URL}${baseToken}`} target="_blank" rel="noopener noreferrer" className="pair-top-solscan-link">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(PairHeader);
