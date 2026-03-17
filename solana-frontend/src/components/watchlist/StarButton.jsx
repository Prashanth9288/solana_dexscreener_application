import React from 'react';
import { Star } from 'lucide-react';
import useWatchlistStore from '../../store/slices/useWatchlistStore';
import '../../styles/watchlist/Watchlist.css';

/**
 * Institutional Star Toggle
 * Hooks directly into Zustand O(1) Set for fast resolution.
 */
function StarButton({ tokenAddress }) {
  const isStarred   = useWatchlistStore((s) => s.favorites.has(tokenAddress));
  const toggleStar  = useWatchlistStore((s) => s.toggleStar);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation(); // prevent clicking through row navigation
    toggleStar(tokenAddress);
  };

  return (
    <button 
      className={`star-btn ${isStarred ? 'active' : ''}`} 
      onClick={handleClick}
      title={isStarred ? "Remove from Watchlist" : "Add to Watchlist"}
    >
      <Star />
    </button>
  );
}

// Memoized to prevent rerenders on unrelated table updates
export default React.memo(StarButton);
