/**
 * Application constants — pure values only.
 * All formatting functions live in utils/formatters.js
 */

// API base — uses Vite proxy in dev, relative path in production
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

// WebSocket URL — dynamically constructed for dev/prod
export const WS_URL = import.meta.env.VITE_WS_URL || '/ws';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const DEX_LIST = [
  { id: 'all', label: 'All DEXes' },
  { id: 'PumpSwap', label: 'PumpSwap', color: '#22c55e' },
  { id: 'Meteora', label: 'Meteora', color: '#3b82f6' },
  { id: 'Raydium', label: 'Raydium', color: '#a855f7' },
  { id: 'Orca', label: 'Orca', color: '#06b6d4' },
  { id: 'Pump.fun', label: 'Pump.fun', color: '#65a30d' },
  { id: 'Jupiter', label: 'Jupiter', color: '#f97316' },
  { id: 'Phoenix', label: 'Phoenix', color: '#ef4444' },
  { id: 'OpenBook', label: 'OpenBook', color: '#eab308' },
  { id: 'Lifinity', label: 'Lifinity', color: '#ec4899' },
  { id: 'FluxBeam', label: 'FluxBeam', color: '#8b5cf6' },
];

export const TIMEFRAMES = [
  { id: '1m', label: '1m', seconds: 60 },
  { id: '5m', label: '5m', seconds: 300 },
  { id: '15m', label: '15m', seconds: 900 },
  { id: '30m', label: '30m', seconds: 1800 },
  { id: '1h', label: '1h', seconds: 3600 },
  { id: '4h', label: '4h', seconds: 14400 },
  { id: '1d', label: 'D', seconds: 86400 },
];

export const MARKET_TIMEFRAMES = [
  { id: '5m', label: '5M' },
  { id: '1h', label: '1H' },
  { id: '6h', label: '6H' },
  { id: '24h', label: '24H' }
];

export const SOLSCAN_TX_URL = 'https://solscan.io/tx/';
export const SOLSCAN_ACCOUNT_URL = 'https://solscan.io/account/';

export const MAX_TRADES_BUFFER = 500;
export const MAX_CANDLES_BUFFER = 2000;
export const MARKET_POLL_INTERVAL = 10_000;
export const TRADES_POLL_INTERVAL = 5_000;
export const HEALTH_CHECK_INTERVAL = 30_000;

export const getDexColor = (dex) => {
  if (!dex) return '#64748b';
  const entry = DEX_LIST.find(d => d.id.toLowerCase() === dex.toLowerCase());
  return entry?.color || '#64748b';
};
