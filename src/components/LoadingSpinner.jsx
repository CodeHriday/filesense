import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ 
  size = 'medium', 
  message = '', 
  fullPage = false,
  className = '',
  showMessage = false // New prop to control message visibility
}) => {
  const containerClass = `loading-spinner-wrapper ${fullPage ? 'fullpage' : ''} ${className}`.trim();
  
  return (
    <div className={containerClass} aria-label={message || 'Loading...'} role="status">
      <div className={`throb-spinner throb-spinner-${size}`}></div>
      {showMessage && message && <p className="loading-message">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;