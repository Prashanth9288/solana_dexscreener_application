import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Star, Plus, Trash2, Pin, Bell, ArrowUp, ArrowDown, Settings2, FolderPlus, X } from 'lucide-react';
import useAuthStore from '../../store/slices/useAuthStore';
import useWatchlistStore from '../../store/slices/useWatchlistStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { TokenRow, SortHeader } from '../../features/market/TokenTable';
import { formatUSD } from '../../utils/formatters';

const columnOrder = ['price', 'age', 'txns', 'volume', 'makers', 'c5m', 'c1h', 'c6h', 'c24h', 'liquidity', 'mcap'];
const visibleColumns = { price: true, age: true, txns: true, volume: true, makers: true, c5m: true, c1h: true, c6h: true, c24h: true, liquidity: true, mcap: true };
const ROW_H = 48;

function WatchlistPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { 
    watchlists, activeWatchlistId, items, loading, 
    fetchWatchlists, setActiveWatchlist, createWatchlist, 
    reorderItems, togglePin, toggleStar, alerts, removeAlert
  } = useWatchlistStore();
  
  const parentRef = React.useRef(null);
  const [liveData, setLiveData] = useState({});
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertTargetToken, setAlertTargetToken] = useState(null);
  const [alertPrice, setAlertPrice] = useState('');
  const [alertDirection, setAlertDirection] = useState('above');

  // Sorting State
  const [sortBy, setSortBy] = useState('position'); // 'position' is the drag-and-drop order
  const [sortDir, setSortDir] = useState('asc');

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  // Initial Fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchWatchlists();
    }
  }, [isAuthenticated, fetchWatchlists]);

  // WebSocket Sync
  const wsChannels = useMemo(() => {
    return items.map(item => `trades:${item.token_address}`);
  }, [items]);

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'trade' || msg.type === 'trades') {
      const payload = msg.type === 'trades' ? msg.data[0] : msg.data;
      if (!payload) return;
      const { token_address, price, change24h } = payload;
      setLiveData(prev => {
        const current = prev[token_address];
        if (current && current.price === price) return prev;
        return {
          ...prev,
          [token_address]: { ...current, price, change24h: change24h ?? current?.change24h }
        };
      });
    }
  }, []);

  useWebSocket(wsChannels, handleWsMessage, isAuthenticated && wsChannels.length > 0);

  // Sorting & Reordering Helpers
  const sortedItems = useMemo(() => {
    let list = [...items];
    
    if (sortBy === 'position') {
      return list.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (a.position || 0) - (b.position || 0);
      });
    }

    // Advanced Header Sorting
    list.sort((a, b) => {
      // Pins always stay at top unless we are sorting explicitly? 
      // Actually normally on terminals, if you sort MCAP, pins might move.
      // But let's keep pins at top for now as it's a "Watchlist" convention.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

      const getVal = (item) => {
        const ticker = liveData[item.token_address] || {};
        switch (sortBy) {
          case 'price': return ticker.price || item.price_usd || 0;
          case 'c24h': return ticker.change24h || item.price_change_24h || 0;
          case 'age': return new Date(item.created_at).getTime();
          case 'volume': return item.volume_24h || 0;
          case 'mcap': return item.market_cap || 0;
          case 'liquidity': return item.liquidity_usd || 0;
          case 'txns': return item.txns_24h || 0;
          default: return 0;
        }
      };

      const aVal = getVal(a);
      const bVal = getVal(b);
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return list;
  }, [items, sortBy, sortDir, liveData]);

  const moveItem = (index, direction) => {
    if (sortBy !== 'position') {
      alert("Manual reordering is disabled while list is sorted. Click header again to reset.");
      return;
    }
    const newItems = [...sortedItems];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    
    // Optimistically re-map positions
    const itemsToSwap = newItems.map((it, idx) => ({ ...it, position: idx }));
    reorderItems(itemsToSwap);
  };

  const activeFolder = watchlists.find(w => w.id === activeWatchlistId);

  // Hydrate with LiveData + Backend Metadata
  const hydratedPairs = useMemo(() => {
    return sortedItems.map(item => {
      const ticker = liveData[item.token_address] || {};
      return {
        ...item, // Includes backend metadata like volume, mcap, etc.
        base_token: item.token_address,
        quote_token: 'So11111111111111111111111111111111111111112',
        price_usd: ticker.price || item.price_usd || 0,
        price_change_24h: ticker.change24h || item.price_change_24h,
      };
    });
  }, [sortedItems, liveData]);

  const rowVirtualizer = useVirtualizer({
    count: hydratedPairs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await createWatchlist(newFolderName);
    setNewFolderName('');
    setShowNewFolderModal(false);
  };

  const handleDeleteFolder = async (id) => {
    if (watchlists.length <= 1) return alert("Cannot delete the last watchlist");
    if (!window.confirm("Delete this watchlist and all items?")) return;
    const { deleteWatchlist } = useWatchlistStore.getState();
    await deleteWatchlist(id);
    fetchWatchlists();
  };

  const handleCreateAlert = async (e) => {
    e.preventDefault();
    const { addAlert } = useWatchlistStore.getState();
    await addAlert({
      token_address: alertTargetToken,
      price_target: parseFloat(alertPrice),
      direction: alertDirection
    });
    setShowAlertModal(false);
    setAlertPrice('');
  };

  const gridTemplate = useMemo(() => {
    const cols = ['minmax(280px, 1.5fr)'];
    columnOrder.forEach(id => {
      if (visibleColumns[id]) {
        switch (id) {
          case 'price': cols.push('100px'); break;
          case 'age': cols.push('70px'); break;
          case 'txns': cols.push('80px'); break;
          case 'volume': cols.push('90px'); break;
          case 'makers': cols.push('80px'); break;
          case 'c24h': cols.push('70px'); break;
          default: cols.push('70px'); break;
        }
      }
    });
    return cols.join(' ');
  }, []);


  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#0b0e14]">
        <div className="text-[#8b99b0] text-sm tabular-nums font-mono flex flex-col items-center gap-2">
          <Star className="w-8 h-8 opacity-50 mb-2" />
          <span>Connect wallet to access your watchlists</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0b0e14] overflow-hidden">
      {/* ── HEADER & TABS ─────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-0 border-b border-[#1e2330]">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold text-[#f0f3fa] flex items-center gap-2">
            <Star className="text-[#f6b87e] w-5 h-5" fill="#f6b87e" /> Watchlists
          </h1>
          <button 
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2330] hover:bg-[#2a3142] text-[#f0f3fa] text-xs font-medium rounded-md transition-colors"
          >
            <FolderPlus className="w-4 h-4" /> New List
          </button>
        </div>
        
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {watchlists.map(w => (
            <div key={w.id} className="relative group/tab">
              <button
                onClick={() => setActiveWatchlist(w.id)}
                className={`px-4 py-2 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                  activeWatchlistId === w.id 
                    ? 'text-[#f0f3fa] border-[#f6b87e]' 
                    : 'text-[#8b99b0] border-transparent hover:text-[#f0f3fa]'
                }`}
              >
                {w.name}
              </button>
              {activeWatchlistId === w.id && (
                <Trash2 
                  onClick={() => handleDeleteFolder(w.id)}
                  className="absolute -top-1 -right-1 w-3 h-3 text-[#ea3943] opacity-0 group-hover/tab:opacity-100 cursor-pointer transition-opacity" 
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── TABLE ────────────────────────────────────────────────────────── */}
      <div className="token-table-container flex-1 min-h-0 flex flex-col">
        <div className="px-6 py-2 bg-[#0d1117] flex items-center justify-between border-b border-[#1e2330]">
           <div className="text-xs text-[#8b99b0] font-mono uppercase tracking-tighter">
             {items.length} TOKENS • {activeFolder?.name || 'FOLDER'}
           </div>
           <Settings2 className="w-4 h-4 text-[#8b99b0] cursor-pointer hover:text-[#f0f3fa]" />
        </div>

        <div className="token-table-header-wrapper bg-[#0b0e14]">
          <div className="token-table-header-grid" style={{ gridTemplateColumns: gridTemplate }}>
            <div 
              className="token-table-header-cell text-left pl-[36px] cursor-pointer hover:text-[#f0f3fa] transition-colors"
              onClick={() => setSortBy('position')}
            >
              TOKEN
            </div>
            {columnOrder.map(id => visibleColumns[id] ? (
              <SortHeader 
                key={id} 
                label={id.toUpperCase()} 
                field={id === 'c24h' ? 'c24h' : id} 
                sortBy={sortBy}
                sortDir={sortDir}
                toggleSort={toggleSort} 
              />
            ) : null)}
          </div>
        </div>

        <div ref={parentRef} className="token-table-body-wrapper flex-1 overflow-y-auto">
          <div className="token-table-body-inner">
            {loading ? (
              <div className="p-12 text-center text-[#8b99b0] text-sm font-mono animate-pulse">Loading list...</div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 gap-3 text-[#535e71]">
                <Plus className="w-10 h-10 opacity-20" />
                <span className="text-sm">This watchlist is empty</span>
                <span className="text-xs opacity-60 text-center">Stars tokens on charts or the<br/>Market page to see them here</span>
              </div>
            ) : (
              <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((vRow) => {
                  const pair = hydratedPairs[vRow.index];
                  const rawItem = sortedItems[vRow.index];
                  
                  return (
                    <div 
                      key={pair.base_token}
                      className="group"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vRow.start}px)`,
                        height: vRow.size,
                      }}
                    >
                      <div className="absolute left-1 top-0 bottom-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 px-2 bg-[#0b0e14]/95 backdrop-blur-md rounded-r-xl border-r border-[#1e2330] shadow-xl">
                        <button 
                          onClick={(e) => { e.stopPropagation(); togglePin(pair.base_token, !pair.pinned); }}
                          title={pair.pinned ? 'Unpin' : 'Pin to top'}
                          className={`p-2 rounded-lg hover:bg-[#1e2330] transition-colors ${pair.pinned ? 'text-[#f6b87e]' : 'text-[#8b99b0]'}`}
                        >
                          <Pin className="w-4 h-4" fill={pair.pinned ? '#f6b87e' : 'none'} />
                        </button>
                        <div className="flex flex-col gap-0.5">
                          <button 
                            onClick={(e) => { e.stopPropagation(); moveItem(vRow.index, 'up'); }}
                            className="p-1 rounded hover:bg-[#1e2330] text-[#8b99b0] disabled:opacity-10 transition-colors"
                            disabled={vRow.index === 0}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); moveItem(vRow.index, 'down'); }}
                            className="p-1 rounded hover:bg-[#1e2330] text-[#8b99b0] disabled:opacity-10 transition-colors"
                            disabled={vRow.index === hydratedPairs.length - 1}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <TokenRow
                        pair={pair}
                        rank={rawItem.pinned ? '📌' : vRow.index + 1}
                        visibleColumns={visibleColumns}
                        gridTemplate={gridTemplate}
                        columnOrder={columnOrder}
                        style={{ height: '100%' }}
                      />
                      
                      <div className="absolute right-2 top-0 bottom-0 flex items-center z-10">
                        <Bell 
                          onClick={(e) => { e.stopPropagation(); setAlertTargetToken(pair.base_token); setShowAlertModal(true); }}
                          className="w-4 h-4 text-[#8b99b0] opacity-0 group-hover:opacity-100 cursor-pointer hover:text-[#f6b87e] transition-all" 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ALERTS SECTION ────────────────────────────────────────────────── */}
      <div className="h-[120px] border-t border-[#1e2330] bg-[#0d1117] p-4">
        <div className="flex items-center gap-2 mb-3 text-[#f0f3fa] text-[10px] font-bold uppercase tracking-widest opacity-60">
           <Bell className="w-3 h-3 text-[#f6b87e]" /> Active Price Alerts
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar">
          {alerts.length === 0 ? (
            <div className="text-[10px] text-[#535e71] font-mono italic">No price alerts set for your account</div>
          ) : (
            alerts.map(a => (
              <div key={a.id} className="min-w-[160px] bg-[#161b22] rounded-md p-2.5 flex flex-col justify-between border border-[#30363d] shadow-sm">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] font-mono text-[#f0f3fa]">{a.token_address.slice(0,4)}...{a.token_address.slice(-4)}</span>
                    <button onClick={() => removeAlert(a.id)} className="p-1 hover:bg-[#ea3943]/10 rounded text-[#ea3943]">
                      <X className="w-3 h-3" />
                    </button>
                 </div>
                 <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${a.direction === 'above' ? 'bg-[#16c784]' : 'bg-[#ea3943]'}`} />
                    <span className="text-[10px] text-[#8b99b0]">Price {a.direction}</span>
                    <span className="text-[10px] font-bold text-[#f0f3fa]">${a.price_target}</span>
                 </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── MODALS ────────────────────────────────────────────────────────── */}
      
      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center modal-overlay">
          <form 
            onSubmit={handleCreateFolder}
            className="modal-content rounded-2xl p-10 w-[460px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-200"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#f0f3fa] flex items-center gap-3">
                <FolderPlus className="w-6 h-6 text-[#f6b87e] shadow-sm" /> Create New Watchlist
              </h3>
              <X onClick={() => setShowNewFolderModal(false)} className="w-5 h-5 text-[#5c6273] cursor-pointer hover:text-[#f0f3fa]" />
            </div>
            
            <p className="text-[#8b99b0] text-sm mb-6">Give your watchlist a name to organize your tokens efficiently.</p>
            
            <input 
              autoFocus
              type="text"
              placeholder="e.g., Memecoin Gems"
              className="w-full modal-input rounded-xl px-5 py-4 text-base focus:outline-none mb-8"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
            />
            
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="flex-1 px-4 py-3.5 text-sm font-semibold text-[#8b99b0] hover:text-[#f0f3fa] hover:bg-[#2a3142] rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="flex-1 px-4 py-3.5 text-sm font-bold bg-[#f6b87e] text-[#0b0e14] rounded-xl hover:bg-[#fbd0a1] hover:scale-[1.02] transform transition-all shadow-lg active:scale-95"
              >
                Create Watchlist
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Alert Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center modal-overlay">
          <form 
            onSubmit={handleCreateAlert}
            className="modal-content rounded-2xl p-10 w-[460px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-200"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-[#f0f3fa] flex items-center gap-3">
                <Bell className="w-6 h-6 text-[#f6b87e]" /> Create Price Alert
              </h3>
              <X onClick={() => setShowAlertModal(false)} className="w-5 h-5 text-[#5c6273] cursor-pointer hover:text-[#f0f3fa]" />
            </div>
            
            <p className="text-[#8b99b0] text-xs mb-8 font-mono opacity-60 overflow-hidden text-ellipsis whitespace-nowrap">Target: {alertTargetToken}</p>
            
            <div className="flex gap-3 mb-6">
              <button 
                type="button"
                onClick={() => setAlertDirection('above')}
                className={`flex-1 py-3 text-sm font-bold rounded-xl border transition-all ${alertDirection === 'above' ? 'bg-[#16c784]/20 border-[#16c784] text-[#16c784] shadow-[0_0_15px_rgba(22,199,132,0.1)]' : 'bg-transparent border-[#2a3142] text-[#8b99b0] hover:border-[#5c6273]'}`}
              >
                Price Above
              </button>
              <button 
                type="button"
                onClick={() => setAlertDirection('below')}
                className={`flex-1 py-3 text-sm font-bold rounded-xl border transition-all ${alertDirection === 'below' ? 'bg-[#ea3943]/20 border-[#ea3943] text-[#ea3943] shadow-[0_0_15px_rgba(234,57,67,0.1)]' : 'bg-transparent border-[#2a3142] text-[#8b99b0] hover:border-[#5c6273]'}`}
              >
                Price Below
              </button>
            </div>

            <div className="relative mb-8">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5c6273] font-mono">$</span>
              <input 
                autoFocus
                step="any"
                type="number"
                placeholder="0.0000"
                className="w-full modal-input rounded-xl pl-8 pr-5 py-4 text-base focus:outline-none font-mono"
                value={alertPrice}
                onChange={e => setAlertPrice(e.target.value)}
              />
            </div>
            
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setShowAlertModal(false)}
                className="flex-1 px-4 py-3.5 text-sm font-semibold text-[#8b99b0] hover:text-[#f0f3fa] hover:bg-[#2a3142] rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="flex-1 px-4 py-3.5 text-sm font-bold bg-[#f6b87e] text-[#0b0e14] rounded-xl hover:bg-[#fbd0a1] transition-all shadow-lg active:scale-95"
              >
                Set Price Alert
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

export default React.memo(WatchlistPage);

