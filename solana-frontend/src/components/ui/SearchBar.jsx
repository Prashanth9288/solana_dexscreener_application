import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, Loader2, ArrowRight, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../../store/slices/useAppStore';
import useDebounce from '../../hooks/useDebounce';
import { API_BASE } from '../../constants';
import '../../styles/ui/SearchBar.css';

const JUPITER_TOKEN_LIST = 'https://token.jup.ag/strict';

function SearchBar() {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const navigate = useNavigate();

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search logic: query backend pairs + Jupiter token list
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    async function doSearch() {
      setLoading(true);
      setSelectedIdx(-1);
      const combined = [];

      try {
        // 1. Query backend pairs
        const backendRes = await fetch(
          `${API_BASE}/analytics/pairs?limit=100`,
          { signal: controller.signal }
        ).then(r => r.ok ? r.json() : []).catch(() => []);

        const q = debouncedQuery.toLowerCase();
        const matchedPairs = (Array.isArray(backendRes) ? backendRes : backendRes?.pairs || [])
          .filter(p => {
            const sym = (p.baseTokenSymbol || p.symbol || '').toLowerCase();
            const name = (p.baseTokenName || p.name || '').toLowerCase();
            const addr = (p.pairAddress || p.address || '').toLowerCase();
            const mint = (p.baseToken || '').toLowerCase();
            return sym.includes(q) || name.includes(q) || addr.includes(q) || mint.includes(q);
          })
          .slice(0, 8)
          .map(p => ({
            type: 'pair',
            symbol: p.baseTokenSymbol || p.symbol || '???',
            name: p.baseTokenName || p.name || '',
            address: p.pairAddress || p.address,
            mint: p.baseToken || '',
            dex: p.dex || '',
            logoURI: p.logoURI || null,
          }));

        combined.push(...matchedPairs);

        // 2. Query Jupiter strict token list (cached by browser)
        const jupRes = await fetch(JUPITER_TOKEN_LIST, { signal: controller.signal })
          .then(r => r.ok ? r.json() : [])
          .catch(() => []);

        const matchedTokens = jupRes
          .filter(t => {
            const sym = (t.symbol || '').toLowerCase();
            const name = (t.name || '').toLowerCase();
            const addr = (t.address || '').toLowerCase();
            return sym.includes(q) || name.includes(q) || addr.includes(q);
          })
          .slice(0, 6)
          .map(t => ({
            type: 'token',
            symbol: t.symbol,
            name: t.name,
            address: t.address,
            mint: t.address,
            dex: 'Jupiter',
            logoURI: t.logoURI || null,
          }));

        // Deduplicate by mint (prefer pairs over tokens)
        const seenMints = new Set(combined.map(r => r.mint));
        for (const tk of matchedTokens) {
          if (!seenMints.has(tk.mint)) {
            combined.push(tk);
            seenMints.add(tk.mint);
          }
        }

        setResults(combined.slice(0, 10));
        setOpen(combined.length > 0);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }

    doSearch();
    return () => controller.abort();
  }, [debouncedQuery]);

  // Navigate to selected result
  const handleSelect = useCallback((item) => {
    const target = item.type === 'pair' ? item.address : item.mint;
    setSearchQuery('');
    setOpen(false);
    setResults([]);
    navigate(`/pair/${target}`);
  }, [navigate, setSearchQuery]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [open, results, selectedIdx, handleSelect]);

  const handleClear = useCallback(() => {
    setSearchQuery('');
    setResults([]);
    setOpen(false);
  }, [setSearchQuery]);

  return (
    <div ref={wrapperRef} className="searchbar-wrapper">
      <Search className="searchbar-icon" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search token or paste address..."
        className="searchbar-input"
      />
      {loading && (
        <Loader2 className="searchbar-spinner" />
      )}
      {!loading && searchQuery && (
        <button onClick={handleClear} className="searchbar-clear-btn">
          <X className="searchbar-clear-icon" />
        </button>
      )}

      {/* Dropdown Results */}
      {open && results.length > 0 && (
        <div className="searchbar-dropdown">
          {results.map((item, idx) => (
            <button
              key={`${item.type}-${item.mint}-${idx}`}
              onClick={() => handleSelect(item)}
              className={`searchbar-result-item ${
                idx === selectedIdx
                  ? 'searchbar-result-item-active'
                  : 'searchbar-result-item-inactive'
              }`}
            >
              {/* Token Logo */}
              {item.logoURI ? (
                <img src={item.logoURI} alt="" className="searchbar-logo-img" loading="lazy" />
              ) : (
                <div className="searchbar-logo-fallback">
                  <Coins className="searchbar-logo-fallback-icon" />
                </div>
              )}

              {/* Info */}
              <div className="searchbar-info-wrapper">
                <div className="searchbar-info-header">
                  <span className="searchbar-info-symbol">{item.symbol}</span>
                  {item.dex && (
                    <span className="searchbar-info-dex">{item.dex}</span>
                  )}
                  <span className="searchbar-info-type">
                    {item.type === 'pair' ? 'PAIR' : 'TOKEN'}
                  </span>
                </div>
                <span className="searchbar-info-name">{item.name}</span>
              </div>

              <ArrowRight className="searchbar-arrow-icon" />
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {open && results.length === 0 && !loading && debouncedQuery.length >= 2 && (
        <div className="searchbar-no-results">
          <span className="searchbar-no-results-text">No tokens found for "{debouncedQuery}"</span>
        </div>
      )}
    </div>
  );
}

export default React.memo(SearchBar);
