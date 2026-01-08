import React from 'react';
import './Skeleton.css';

type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'card';

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  size?: number; // For circular variant
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  size,
  className = '',
}) => {
  const getStyle = () => {
    const style: React.CSSProperties = {};

    if (variant === 'circular') {
      const dimension = size || 40;
      style.width = dimension;
      style.height = dimension;
      style.borderRadius = '50%';
    } else if (variant === 'card') {
      style.width = '100%';
      style.height = height || 200;
      style.borderRadius = 'var(--radius-lg, 16px)';
    } else if (variant === 'rectangular') {
      style.width = width || '100%';
      style.height = height || 20;
      style.borderRadius = 'var(--radius-sm, 6px)';
    } else {
      // text variant
      style.width = width || '100%';
      style.height = height || 16;
      style.borderRadius = 'var(--radius-sm, 6px)';
    }

    return style;
  };

  return (
    <div
      className={`skeleton skeleton-${variant} ${className}`}
      style={getStyle()}
      aria-busy="true"
      aria-live="polite"
    />
  );
};

// Skeleton Card - Pre-built card skeleton
export const SkeletonCard: React.FC = () => {
  return (
    <div className="skeleton-card-wrapper">
      <Skeleton variant="rectangular" height={140} />
      <div style={{ padding: '16px' }}>
        <Skeleton variant="text" width="70%" height={20} />
        <Skeleton variant="text" width="90%" height={14} style={{ marginTop: '8px' }} />
        <Skeleton variant="text" width="60%" height={14} style={{ marginTop: '8px' }} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <Skeleton variant="rectangular" width={80} height={32} />
          <Skeleton variant="rectangular" width={80} height={32} />
        </div>
      </div>
    </div>
  );
};
