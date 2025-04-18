import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = () => {
  return (
    <div className="loading-spinner" aria-label="Loading..." role="status">
      <div className="spinner"></div>
    </div>
  );
};

export default LoadingSpinner;