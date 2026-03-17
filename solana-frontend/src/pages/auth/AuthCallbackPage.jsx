// src/pages/auth/AuthCallbackPage.jsx — OAuth Callback Token Receiver
// ─────────────────────────────────────────────────────────────────────────────
// After Google/Twitter OAuth, backend redirects here with tokens in URL hash.
// This page extracts them, stores via useAuthStore, then redirects to /market.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/slices/useAuthStore';

function AuthCallbackPage() {
  const navigate = useNavigate();
  const login    = useAuthStore((s) => s.login);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    try {
      // Tokens come in the URL hash fragment (never sent to server)
      const hash = window.location.hash.slice(1); // remove '#'
      if (!hash) {
        console.warn('[AuthCallback] No hash fragment found');
        navigate('/market', { replace: true });
        return;
      }

      const params = new URLSearchParams(hash);
      const access_token  = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      const userId       = params.get('user_id');
      const email        = params.get('email');
      const provider     = params.get('provider');

      if (access_token && refresh_token) {
        login({
          access_token,
          refresh_token,
          user: {
            id:       Number(userId),
            email:    email || null,
            provider: provider || 'oauth',
            role:     'user',
          },
        });
      }

      // Use React Router navigate to prevent full page reload from killing Zustand LocalStorage writes
      setTimeout(() => {
        navigate('/market', { replace: true });
      }, 100);
    } catch (err) {
      console.error('[AuthCallback] Error processing OAuth callback:', err);
      setTimeout(() => {
        navigate('/market', { replace: true });
      }, 100);
    }
  }, [login, navigate]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: '#0b0e14',
      color: '#8b99b0',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '14px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32, border: '3px solid #1e2736',
          borderTopColor: '#16c784', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px',
        }} />
        Completing authentication...
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default AuthCallbackPage;
