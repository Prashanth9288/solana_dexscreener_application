import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Settings, Wallet, ArrowDownUp, Loader2 } from 'lucide-react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { createJupiterApiClient } from '@jup-ag/api';
import usePairStore from '../../store/slices/usePairStore';
import useAppStore from '../../store/slices/useAppStore';
import useDebounce from '../../hooks/useDebounce';
import { formatUSD } from '../../utils/formatters';
import { SOL_MINT } from '../../constants';
import '../../styles/swap/SwapModule.css';

const PRESETS_SOL = [0.1, 0.25, 0.5, 1, 5];
const SLIPPAGE_OPTS = [0.5, 1, 3, 5, 10];

// Safe Vite/Browser Base64 to Uint8Array decoder
function base64ToUint8Array(base64) {
  const binString = window.atob(base64);
  const bytes = new Uint8Array(binString.length);
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}

const jupiterQuoteApi = createJupiterApiClient();

function SwapModule() {
  const [mode, setMode] = useState('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(3);
  const [showSettings, setShowSettings] = useState(false);

  const [quoteResponse, setQuoteResponse] = useState(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

  const { connection } = useConnection();
  const { connected, publicKey, signTransaction, sendTransaction } = useWallet();

  const baseTokenMeta = usePairStore((s) => s.baseTokenMeta);
  const baseToken = usePairStore((s) => s.baseToken);
  const solPrice = useAppStore((s) => s.solPrice);

  const symbol = baseTokenMeta?.symbol || 'TOKEN';
  const liveSolPrice = solPrice || 0;
  
  // Use a fallback decimal of 6 if not available in meta
  const tokenDecimals = baseTokenMeta?.decimals || 6;
  const debouncedAmount = useDebounce(amount, 400);

  // 1. Fetch Real-time Quote from Jupiter
  useEffect(() => {
    async function getQuote() {
      if (!debouncedAmount || isNaN(debouncedAmount) || Number(debouncedAmount) <= 0 || !baseToken) {
        setQuoteResponse(null);
        return;
      }

      setIsQuoting(true);
      try {
        const amountLamports = mode === 'buy'
          ? Math.floor(Number(debouncedAmount) * 1e9)
          : Math.floor(Number(debouncedAmount) * Math.pow(10, tokenDecimals));

        const inputMint = mode === 'buy' ? SOL_MINT : baseToken;
        const outputMint = mode === 'buy' ? baseToken : SOL_MINT;

        const quote = await jupiterQuoteApi.quoteGet({
          inputMint,
          outputMint,
          amount: amountLamports,
          slippageBps: slippage * 100,
        });

        setQuoteResponse(quote || null);
      } catch (err) {
        console.error('Jupiter Quote Error:', err);
        setQuoteResponse(null);
      } finally {
        setIsQuoting(false);
      }
    }

    getQuote();
  }, [debouncedAmount, mode, slippage, baseToken, tokenDecimals]);

  // 2. Compute strictly formatted estimate from Quote Response
  const estimate = useMemo(() => {
    if (!quoteResponse) return null;
    const outAmount = Number(quoteResponse.outAmount);
    if (mode === 'buy') {
      return outAmount / Math.pow(10, tokenDecimals);
    }
    return outAmount / 1e9; // selling token for SOL
  }, [quoteResponse, mode, tokenDecimals]);

  // 3. Execute Swap Transaction
  const handleSwap = useCallback(async () => {
    if (!publicKey || !connected || !quoteResponse) return;

    setIsSwapping(true);
    try {
      const { swapTransaction } = await jupiterQuoteApi.swapPost({
        swapRequest: {
          quoteResponse,
          userPublicKey: publicKey.toBase58(),
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        },
      });

      // Deserialize transaction
      const swapTransactionBuf = base64ToUint8Array(swapTransaction);
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      
      // Sign/Send mapped through wallet adapter
      const signature = await sendTransaction(transaction, connection);
      
      console.log('Swap Success! Signature:', signature);
      alert(`Swap Submitted!\nSignature: ${signature}`);
      
      // Clear input on success
      setAmount('');
    } catch (err) {
      console.error('Swap failed:', err);
      alert('Swap Failed: ' + (err.message || 'Transaction rejected'));
    } finally {
      setIsSwapping(false);
    }
  }, [publicKey, connected, quoteResponse, connection, sendTransaction]);

  const handlePreset = useCallback((v) => setAmount(String(v)), []);

  return (
    <div className="swap-module-container">
      {/* Buy / Sell Tabs */}
      <div className="swap-tabs-wrapper">
        <button onClick={() => setMode('buy')}
          className={`swap-tab-btn ${
            mode === 'buy' ? 'buy' : 'buy-inactive'
          }`}>
          Buy
          {mode === 'buy' && <div className="swap-tab-indicator-buy" />}
        </button>
        <div className="swap-tab-divider" />
        <button onClick={() => setMode('sell')}
          className={`swap-tab-btn ${
            mode === 'sell' ? 'sell' : 'sell-inactive'
          }`}>
          Sell
          {mode === 'sell' && <div className="swap-tab-indicator-sell" />}
        </button>
      </div>

      <div className="swap-content-wrapper">
        {/* Input */}
        <div>
          <div className="swap-input-header">
            <span className="swap-input-label">
              {mode === 'buy' ? 'You pay (SOL)' : `You sell (${symbol})`}
            </span>
            <button onClick={() => setShowSettings(!showSettings)} className="swap-settings-btn">
              <Settings className="w-3 h-3" />
            </button>
          </div>
          <div className="swap-input-container">
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="swap-input-field" />
            <span className="swap-input-currency">
              {mode === 'buy' ? 'SOL' : symbol}
            </span>
          </div>
        </div>

        {/* Presets */}
        <div className="swap-presets-grid">
          {PRESETS_SOL.map((v) => (
            <button key={v} onClick={() => handlePreset(v)}
              className="swap-preset-btn">
              {v}
            </button>
          ))}
        </div>

        {/* Slippage */}
        {showSettings && (
          <div className="anim-slide-dn">
            <span className="swap-slippage-label">Slippage Tolerance</span>
            <div className="swap-slippage-opts-wrapper">
              {SLIPPAGE_OPTS.map((s) => (
                <button key={s} onClick={() => setSlippage(s)}
                  className={`swap-slippage-btn ${
                    slippage === s
                      ? 'active'
                      : 'inactive'
                  }`}>
                  {s}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Estimate Card */}
        {isQuoting ? (
          <div className="swap-quote-loading">
             <Loader2 className="swap-loader-sm" />
             <span className="swap-quote-loading-text">Fetching best route...</span>
          </div>
        ) : estimate !== null ? (
          <div className="swap-quote-card">
            <div className="swap-quote-row">
              <span className="swap-quote-label">You receive (est.)</span>
              <span className="swap-quote-value">
                {estimate.toFixed(4)} {mode === 'buy' ? symbol : 'SOL'}
              </span>
            </div>
            <div className="swap-quote-subrow">
              <span>Slippage: {slippage}%</span>
              <span>SOL: {formatUSD(liveSolPrice)}</span>
            </div>
            {quoteResponse?.routePlan && (
              <div className="swap-quote-details">
                <span>Route: {quoteResponse.routePlan.length > 1 ? 'Multi-hop' : 'Direct'}</span>
                <span>Fee: ~{formatUSD((quoteResponse.platformFee?.amount || 0) / 1e9 * liveSolPrice)}</span>
              </div>
            )}
          </div>
        ) : null}

        {/* Action Button */}
        <button className={`swap-btn-submit ${mode === 'buy' ? 'buy' : 'sell'}`} disabled={!connected || !quoteResponse || isSwapping || isQuoting} onClick={handleSwap}>
          {isSwapping ? <Loader2 className="swap-loader-md" /> : <Wallet className="swap-wallet-icon" />}
          <span>{isSwapping ? 'Swapping...' : connected ? (mode === 'buy' ? 'Place Buy Order' : 'Place Sell Order') : 'Connect Wallet'}</span>
        </button>
      </div>
    </div>
  );
}

export default React.memo(SwapModule);
