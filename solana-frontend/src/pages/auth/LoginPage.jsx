// src/pages/auth/LoginPage.jsx — Hybrid Login / Register Page
// ─────────────────────────────────────────────────────────────────────────────
// Supports: Google OAuth, Twitter/X OAuth, Wallet Connect, Email/Password
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import useAuthStore from '../../store/slices/useAuthStore';
import { useWalletAuth } from '../../hooks/useWalletAuth';
import CustomWalletModal from '../../components/ui/CustomWalletModal';
import { API_BASE } from '../../constants';
import '../../styles/auth/LoginPage.css';

// ── SVG Icons (inline to avoid extra deps) ───────────────────────────────────

const GoogleIcon = () => (
  <svg className="auth-social-icon" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const TwitterIcon = () => (
  <svg className="auth-social-icon" viewBox="0 0 24 24" fill="#1DA1F2">
    <path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/>
  </svg>
);

const WalletIcon = () => (
  <svg className="auth-social-icon" viewBox="0 0 24 24" fill="none" stroke="#16c784" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5z"/>
    <path d="M16 12h.01"/>
  </svg>
);

function LoginPage() {
  const navigate = useNavigate();
  const { disconnect, connected } = useWallet();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isAuthenticated         = useAuthStore((s) => s.isAuthenticated);
  const login                   = useAuthStore((s) => s.login);

  useWalletAuth();

  const [mode, setMode]       = useState('login');    // 'login' | 'register'
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) navigate('/market', { replace: true });
  }, [isAuthenticated, navigate]);

  // ── Google OAuth ───────────────────────────────────────────────────────────
  const handleGoogle = useCallback(() => {
    // Redirect to backend Google OAuth initiator
    const backendBase = import.meta.env.VITE_API_URL || window.location.origin;
    window.location.href = `${backendBase}/api/auth/google`;
  }, []);

  // ── Twitter OAuth ──────────────────────────────────────────────────────────
  const handleTwitter = useCallback(() => {
    const backendBase = import.meta.env.VITE_API_URL || window.location.origin;
    window.location.href = `${backendBase}/api/auth/twitter`;
  }, []);

  // ── Wallet Connect ─────────────────────────────────────────────────────────
  const handleWallet = useCallback(async () => {
    try {
      if (connected) {
        await disconnect();
        return;
      }
      setIsModalOpen(true);
    } catch (err) {
      setError('Initialization failed');
    }
  }, [connected, disconnect]);

  // ── Email Login / Register ─────────────────────────────────────────────────
  const handleEmailSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'register' ? 'register' : 'login';
      const res = await fetch(`${API_BASE}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        setLoading(false);
        return;
      }

      login(data);
      navigate('/market', { replace: true });
    } catch (err) {
      setError('Network error — check your connection');
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, login, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* ── Logo ─────────────────────────────────────────── */}
        <div className="auth-logo">
          <div className="auth-logo-icon">◎</div>
          <span className="auth-logo-text">Solana DEX Terminal</span>
        </div>
        <p className="auth-subtitle">
          {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
        </p>

        {/* ── Error ────────────────────────────────────────── */}
        {error && <div className="auth-error">{error}</div>}

        {/* ── Social Buttons ───────────────────────────────── */}
        <div className="auth-social-buttons">
          <button className="auth-social-btn auth-social-btn--google" onClick={handleGoogle}>
            <GoogleIcon />
            Continue with Google
          </button>
          <button className="auth-social-btn auth-social-btn--twitter" onClick={handleTwitter}>
            <TwitterIcon />
            Continue with Twitter / X
          </button>
          <button className="auth-social-btn auth-social-btn--wallet" onClick={handleWallet}>
            <WalletIcon />
            Connect Solana Wallet
          </button>
        </div>

        {/* ── Divider ──────────────────────────────────────── */}
        <div className="auth-divider">
          <div className="auth-divider-line" />
          <span className="auth-divider-text">or</span>
          <div className="auth-divider-line" />
        </div>

        {/* ── Email Form ───────────────────────────────────── */}
        <form className="auth-form" onSubmit={handleEmailSubmit}>
          <div className="auth-input-group">
            <label className="auth-input-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="auth-input-group">
            <label className="auth-input-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="auth-input"
              type="password"
              placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : 1}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          </div>
          <button className="auth-submit-btn" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        {/* ── Toggle Login / Register ──────────────────────── */}
        <div className="auth-toggle">
          {mode === 'login' ? (
            <>Don't have an account? <button className="auth-toggle-link" onClick={() => { setMode('register'); setError(''); }}>Sign up</button></>
          ) : (
            <>Already have an account? <button className="auth-toggle-link" onClick={() => { setMode('login'); setError(''); }}>Sign in</button></>
          )}
        </div>

        {/* ── Back to Market ───────────────────────────────── */}
        <Link to="/market" className="auth-back-link">← Back to market</Link>
      </div>

      {/* ── Custom Wallet Modal ──────────────────────────── */}
      <CustomWalletModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
}

export default LoginPage;
