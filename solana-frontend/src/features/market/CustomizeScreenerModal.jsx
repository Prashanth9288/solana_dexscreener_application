import React, { useState, useEffect } from 'react';
import useMarketStore from '../../store/slices/useMarketStore';
import { X, GripVertical, Check } from 'lucide-react';
import '../../styles/market/CustomizeScreenerModal.css';

const COLUMN_LABELS = {
  price: 'Price',
  age: 'Age',
  txns: 'Transactions',
  volume: 'Volume',
  makers: 'Makers',
  c5m: '5M',
  c1h: '1H',
  c6h: '6H',
  c24h: '24H',
  liquidity: 'Liquidity',
  mcap: 'Market Cap',
};

export default function CustomizeScreenerModal({ isOpen, onClose }) {
  const visibleColumns = useMarketStore((s) => s.visibleColumns);
  const columnOrder = useMarketStore((s) => s.columnOrder);
  const setVisibleColumns = useMarketStore((s) => s.setVisibleColumns);
  const setColumnOrder = useMarketStore((s) => s.setColumnOrder);
  const resetVisibleColumns = useMarketStore((s) => s.resetVisibleColumns);

  const [localCols, setLocalCols] = useState(visibleColumns);
  const [localOrder, setLocalOrder] = useState(columnOrder);

  useEffect(() => {
    if (isOpen) {
      setLocalCols(visibleColumns);
      setLocalOrder(columnOrder);
    }
  }, [isOpen, visibleColumns, columnOrder]);

  if (!isOpen) return null;

  const handleToggle = (id) => {
    setLocalCols(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // ── Drag & Drop Logic ──────────────────────────────────────────────────
  const [draggedIndex, setDraggedIndex] = useState(null);

  const onDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox
    e.dataTransfer.setData('text/plain', index);
  };

  const onDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...localOrder];
    const item = newOrder.splice(draggedIndex, 1)[0];
    newOrder.splice(index, 0, item);
    setLocalOrder(newOrder);
    setDraggedIndex(index);
  };

  const onDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleApply = () => {
    setVisibleColumns(localCols);
    setColumnOrder(localOrder);
    onClose();
  };

  const handleReset = () => {
    resetVisibleColumns();
    onClose();
  };

  return (
    <div className="screener-modal-overlay" onClick={onClose}>
      <div className="screener-modal-content" onClick={e => e.stopPropagation()}>
        <div className="screener-modal-header">
          <span className="screener-modal-title">Customize Screener</span>
          <button className="screener-modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="screener-modal-body">
          {localOrder.map((id, index) => (
            <div 
              key={id} 
              className={`screener-column-item ${draggedIndex === index ? 'dragging' : ''}`}
              draggable
              onDragStart={(e) => onDragStart(e, index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDragEnd={onDragEnd}
            >
              <div className="screener-column-left">
                <input 
                  type="checkbox" 
                  className="screener-checkbox"
                  checked={localCols[id]}
                  onChange={() => handleToggle(id)}
                />
                <span className="screener-column-label">{COLUMN_LABELS[id]}</span>
              </div>
              <div className="screener-drag-handle">
                <GripVertical size={18} />
              </div>
            </div>
          ))}
        </div>

        <div className="screener-modal-footer">
          <button className="screener-apply-btn" onClick={handleApply}>
            <Check size={16} style={{marginRight: '8px', display: 'inline'}} /> Apply
          </button>
          <button className="screener-reset-btn" onClick={handleReset}>
            <X size={16} /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}
