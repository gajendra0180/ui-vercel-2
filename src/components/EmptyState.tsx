import React from 'react';
import './EmptyState.css';

interface ActionButton {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

interface EmptyStateProps {
  icon?: string; // emoji or emoji name
  title: string;
  description: string | React.ReactNode;
  actionButton?: ActionButton;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '📭',
  title,
  description,
  actionButton,
}) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" role="presentation">
        {icon}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-description">{description}</p>
      {actionButton && (
        <button
          className={`empty-state-button empty-state-button-${actionButton.variant || 'primary'}`}
          onClick={actionButton.onClick}
        >
          {actionButton.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
