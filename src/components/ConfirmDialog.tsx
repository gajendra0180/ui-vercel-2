import React from 'react';
import './ConfirmDialog.css';

type DialogVariant = 'warning' | 'danger' | 'info';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const handleConfirm = async () => {
    await onConfirm();
  };

  if (!isOpen) return null;

  // Icon variants
  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return (
          <svg className="confirm-dialog-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="confirm-dialog-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'info':
        return (
          <svg className="confirm-dialog-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="confirm-dialog-overlay" onClick={onCancel} role="presentation" />
      <div className="confirm-dialog" role="alertdialog" aria-labelledby="dialog-title" aria-describedby="dialog-message">
        <div className={`confirm-dialog-card confirm-dialog-${variant}`}>
          {/* Icon Header */}
          <div className={`confirm-dialog-icon-header confirm-dialog-icon-${variant}`}>
            {getIcon()}
          </div>

          {/* Content */}
          <div className="confirm-dialog-content">
            <h2 id="dialog-title" className="confirm-dialog-title">{title}</h2>
            <div id="dialog-message" className="confirm-dialog-message">
              {message}
            </div>
          </div>

          {/* Actions */}
          <div className="confirm-dialog-actions">
            <button
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={isLoading}
            >
              {cancelText}
            </button>
            <button
              className={`btn btn-${variant === 'info' ? 'primary' : variant}`}
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : confirmText}
            </button>
          </div>

          {/* Loading Overlay */}
          {isLoading && (
            <div className="confirm-dialog-loading-overlay">
              <div className="confirm-dialog-spinner" />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ConfirmDialog;
