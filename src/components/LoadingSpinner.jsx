import React from 'react';
import './styles/LoadingSpinner.css';

const LoadingSpinner = ({ size = 'medium', color = 'primary', text = 'Loading...', textPosition = 'bottom' }) => {
  const getSpinnerClass = () => {
    let classes = ['loading-spinner'];
    
    classes.push(`spinner-${size}`);
    classes.push(`spinner-${color}`);
    
    return classes.join(' ');
  };
  
  return (
    <div className="spinner-container">
      {textPosition === 'top' && text && <div className="spinner-text">{text}</div>}
      <div className={getSpinnerClass()}>
        <div className="spinner-circle"></div>
      </div>
      {textPosition === 'bottom' && text && <div className="spinner-text">{text}</div>}
    </div>
  );
};

export default LoadingSpinner;