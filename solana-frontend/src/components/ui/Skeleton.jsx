import React from 'react';
import '../../styles/ui/Skeleton.css';

export function Skeleton({ width = '100%', height = '14px', className = '', rounded = false }) {
  return (
    <div
      className={`skeleton-base ${rounded ? 'skeleton-rounded' : ''} ${className}`}
      style={{ width, height, minHeight: height }}
    />
  );
}

export function SkeletonRow({ columns = 8, height = '40px' }) {
  return (
    <tr style={{ height }}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="skeleton-row-cell">
          <Skeleton height="12px" width={i === 0 ? '20px' : i === 1 ? '100px' : `${50 + Math.random() * 30}px`} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard({ height = '100px' }) {
  return (
    <div className="skeleton-card" style={{ height }}>
      <Skeleton width="60%" height="14px" className="skeleton-card-title" />
      <Skeleton width="40%" height="20px" />
    </div>
  );
}

export default Skeleton;
