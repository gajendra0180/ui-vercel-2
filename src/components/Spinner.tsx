import React from 'react';
import './Spinner.css';

export type SpinnerSize = 'small' | 'medium' | 'large';

interface SpinnerProps {
  size?: SpinnerSize;
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'medium', label = 'Loading...' }) => {
  return (
    <div className={`spinner-container spinner-${size}`} aria-label={label} role="status">
      <div className="spinner">
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
      </div>
      {label && <p className="spinner-label">{label}</p>}
    </div>
  );
};

export default Spinner;
