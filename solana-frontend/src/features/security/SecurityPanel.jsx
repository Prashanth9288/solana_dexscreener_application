import React, { useEffect, useState, useMemo } from 'react';
import { Shield, CheckCircle, AlertTriangle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import usePairStore from '../../store/slices/usePairStore';
import { getTokenSecurity } from '../../services/api';
import '../../styles/security/SecurityPanel.css';

const STATUS_MAP = {
  safe:    { icon: CheckCircle,    color: 'text-buy',    bg: 'bg-buy/10' },
  good:    { icon: CheckCircle,    color: 'text-buy',    bg: 'bg-buy/10' },
  burned:  { icon: CheckCircle,    color: 'text-buy',    bg: 'bg-buy/10' },
  revoked: { icon: CheckCircle,    color: 'text-buy',    bg: 'bg-buy/10' },
  unknown: { icon: AlertTriangle,  color: 'text-yellow', bg: 'bg-yellow/10' },
  warn:    { icon: AlertTriangle,  color: 'text-yellow', bg: 'bg-yellow/10' },
  danger:  { icon: XCircle,        color: 'text-sell',   bg: 'bg-sell/10' },
  active:  { icon: XCircle,        color: 'text-sell',   bg: 'bg-sell/10' },
  enabled: { icon: XCircle,        color: 'text-sell',   bg: 'bg-sell/10' },
};

function StatusRow({ label, status, detail }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.unknown;
  const Icon = cfg.icon;
  return (
    <div className="security-status-row">
      <span className="security-status-label">{label}</span>
      <div className="security-status-info">
        {detail && <span className="security-status-detail">{detail}</span>}
        <div className={`security-status-badge ${cfg.bg}`}>
          <Icon className={`w-3 h-3 ${cfg.color}`} />
          <span className={`security-status-badge-text ${cfg.color}`}>{status || 'Unknown'}</span>
        </div>
      </div>
    </div>
  );
}

function SecurityPanel() {
  const baseTokenMeta = usePairStore((s) => s.baseTokenMeta);
  const baseToken = usePairStore((s) => s.baseToken);
  const loading = usePairStore((s) => s.loading);

  const [securityData, setSecurityData] = useState(null);
  const [secLoading, setSecLoading] = useState(false);

  // Fetch security report from RugCheck when baseToken changes
  useEffect(() => {
    if (!baseToken) return;
    const controller = new AbortController();

    async function fetchSecurity() {
      setSecLoading(true);
      try {
        const data = await getTokenSecurity(baseToken, controller.signal);
        if (!controller.signal.aborted) setSecurityData(data);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Security fetch:', err);
      } finally {
        if (!controller.signal.aborted) setSecLoading(false);
      }
    }

    fetchSecurity();
    return () => controller.abort();
  }, [baseToken]);

  // Derive security statuses
  const secInfo = useMemo(() => {
    // Base from token metadata
    const mintAuth = baseTokenMeta?.mintAuthority
      ? (baseTokenMeta.mintAuthority === 'revoked' || baseTokenMeta.mintAuthority === null ? 'revoked' : 'active')
      : 'unknown';
    const freezeAuth = baseTokenMeta?.freezeAuthority
      ? (baseTokenMeta.freezeAuthority === 'revoked' || baseTokenMeta.freezeAuthority === null ? 'revoked' : 'active')
      : 'unknown';

    // RugCheck data enrichment
    let lpStatus = 'unknown';
    let lpDetail = null;
    let topHolders = 'unknown';
    let topHolderDetail = null;
    let overallRisk = 'unknown';
    let riskScore = null;

    if (securityData) {
      // Overall risk
      riskScore = securityData.score;
      if (riskScore !== undefined) {
        overallRisk = riskScore >= 700 ? 'good' : riskScore >= 400 ? 'warn' : 'danger';
      }

      // LP Status from RugCheck markets data
      const markets = securityData.markets || [];
      if (markets.length > 0) {
        const mainMarket = markets[0];
        const lpLocked = mainMarket.lp?.lpLockedPct;
        if (lpLocked !== undefined) {
          lpDetail = `${(lpLocked * 100).toFixed(1)}%`;
          lpStatus = lpLocked >= 0.9 ? 'burned' : lpLocked >= 0.5 ? 'warn' : 'danger';
        }
      }

      // Top holders concentration from RugCheck
      const topHoldersList = securityData.topHolders || [];
      if (topHoldersList.length > 0) {
        const totalPct = topHoldersList.slice(0, 10).reduce((sum, h) => sum + (h.pct || 0), 0);
        topHolderDetail = `${(totalPct * 100).toFixed(1)}%`;
        topHolders = totalPct <= 0.15 ? 'safe' : totalPct <= 0.35 ? 'warn' : 'danger';
      }
    }

    return { mintAuth, freezeAuth, lpStatus, lpDetail, topHolders, topHolderDetail, overallRisk, riskScore };
  }, [baseTokenMeta, securityData]);

  const isLoading = loading || secLoading;

  return (
    <div className="security-panel-container">
      <div className="security-header-row">
        <div className="security-header-title-container">
          <Shield className="w-3.5 h-3.5 text-blue" />
          <span className="security-header-title">Security</span>
        </div>
        {secInfo.riskScore !== null && (
          <div className={`security-score-badge
            ${secInfo.overallRisk === 'good' ? 'bg-buy/10 text-buy' :
              secInfo.overallRisk === 'warn' ? 'bg-yellow/10 text-yellow' : 'bg-sell/10 text-sell'}`}>
            Score: {secInfo.riskScore}/1000
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="security-loading-container">
          <Loader2 className="security-loader-icon" />
          <span className="security-loading-text">Checking security...</span>
        </div>
      ) : (
        <div className="security-content-list">
          <StatusRow label="Mint Authority" status={secInfo.mintAuth} />
          <StatusRow label="Freeze Authority" status={secInfo.freezeAuth} />
          <StatusRow label="LP Burned/Locked" status={secInfo.lpStatus} detail={secInfo.lpDetail} />
          <StatusRow label="Top 10 Holders" status={secInfo.topHolders} detail={secInfo.topHolderDetail} />
          {baseToken && (
            <a
              href={`https://rugcheck.xyz/tokens/${baseToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="security-external-link"
            >
              <ExternalLink className="w-3 h-3" />
              Full Report on RugCheck
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(SecurityPanel);
