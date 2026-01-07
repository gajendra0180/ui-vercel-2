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

  return (
    <>
      <div className="confirm-dialog-overlay" onClick={onCancel} role="presentation" />
      <div className="confirm-dialog" role="alertdialog" aria-labelledby="dialog-title" aria-describedby="dialog-message">
        <div className={`confirm-dialog-content confirm-dialog-${variant}`}>
          <h2 id="dialog-title" className="confirm-dialog-title">{title}</h2>
          <div id="dialog-message" className="confirm-dialog-message">
            {message}
          </div>
          <div className="confirm-dialog-actions">
            <button
              className="confirm-dialog-button confirm-dialog-cancel"
              onClick={onCancel}
              disabled={isLoading}
            >
              {cancelText}
            </button>
            <button
              className={`confirm-dialog-button confirm-dialog-confirm confirm-dialog-${variant}`}
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? '⏳ Processing...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ConfirmDialog;
