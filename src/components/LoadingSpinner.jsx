import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ 
  size = 'medium', 
  message = '', 
  fullPage = false,
  className = '' 
}) => {
  const containerClass = `loading-spinner ${fullPage ? 'fullpage' : ''} ${className}`.trim();
  
  return (
    <div className={containerClass} aria-label={message || 'Loading...'} role="status">
      <div className={`throb-spinner throb-spinner-${size}`}></div>
      {message && <p className="loading-message">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;