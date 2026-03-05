export function formatUSD(value, decimals = 4) {
  if (!value || isNaN(value)) return '$0.00';
  const num = Number(value);
  if (num === 0) return '$0.00';

  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  
  // Exact Dexscreener rounding logic
  if (num >= 1) return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (num >= 0.01) return `$${num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  if (num >= 0.0001) return `$${num.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
  
  // For micro-coins, use scientific notation or many decimals
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })}`;
}

export function formatNumber(value, maxDecimals = 2) {
  if (!value || isNaN(value)) return '0';
  const num = Number(value);
  
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  
  return num.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}

export function formatTokenAmount(value) {
  if (!value || isNaN(value)) return '0';
  const num = Number(value);
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  if (num < 1) return num.toFixed(4);
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const num = Number(value);
  if (num === 0) return '0.00%';
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(2)}%`;
}

export function shortenAddress(address, chars = 4) {
  if (!address) return '';
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function timeAgo(timestamp) {
  if (!timestamp) return '...';
  // Attempt to parse string/number
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '...';

  const now = new Date();
  const seconds = Math.floor((now - d) / 1000);

  if (seconds < 2) return '1s'; // Real-time pulse
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatAge(timestamp) {
  if (!timestamp) return '—';
  const text = timeAgo(timestamp);
  if (text === '...') return '—';
  return text;
}

export function normalizeTimestamp(ts) {
  if (!ts) return Date.now();
  if (typeof ts === 'number') {
    return ts > 1e11 ? ts : ts * 1000;
  }
  const parsed = new Date(ts).getTime();
  return isNaN(parsed) ? Date.now() : parsed;
}

export function computePercentChange(latest, historical) {
  if (!latest || !historical || historical === 0) return null;
  return ((latest - historical) / historical) * 100;
}
