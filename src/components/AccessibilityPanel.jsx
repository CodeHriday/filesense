import React, { useState } from 'react';
import { FiEye, FiMaximize, FiType, FiRefreshCw } from 'react-icons/fi';
import { useAccessibility } from '../contexts/AccessibilityContext';
import './AccessibilityPanel.css';

const AccessibilityPanel = () => {
  const [isVisible, setIsVisible] = useState(false);
  const {
    highContrast,
    largeText,
    screenReaderOptimized,
    toggleHighContrast,
    toggleLargeText,
    toggleScreenReaderOptimized,
    resetAccessibility
  } = useAccessibility();

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  return (
    <div className="accessibility-container">
      <button 
        className="accessibility-toggle-button"
        onClick={toggleVisibility}
        aria-label="Toggle Accessibility Panel"
        aria-expanded={isVisible}
      >
        <FiEye size={24} aria-hidden="true" />
        <span className="sr-only">Accessibility Options</span>
      </button>

      {isVisible && (
        <div 
          className="accessibility-panel"
          role="dialog"
          aria-labelledby="accessibility-title"
        >
          <h2 id="accessibility-title" className="accessibility-title">Accessibility Options</h2>
          
          <div className="accessibility-options">
            <div className="accessibility-option">
              <button 
                className={`accessibility-button ${highContrast ? 'active' : ''}`}
                onClick={toggleHighContrast}
                aria-pressed={highContrast}
              >
                <FiMaximize aria-hidden="true" />
                <span>High Contrast</span>
              </button>
              <p className="accessibility-description">
                Enhances color contrast for better visibility
              </p>
            </div>

            <div className="accessibility-option">
              <button 
                className={`accessibility-button ${largeText ? 'active' : ''}`}
                onClick={toggleLargeText}
                aria-pressed={largeText}
              >
                <FiType aria-hidden="true" />
                <span>Large Text</span>
              </button>
              <p className="accessibility-description">
                Increases text size for easier reading
              </p>
            </div>

            <div className="accessibility-option">
              <button 
                className={`accessibility-button ${screenReaderOptimized ? 'active' : ''}`}
                onClick={toggleScreenReaderOptimized}
                aria-pressed={screenReaderOptimized}
              >
                <FiEye aria-hidden="true" />
                <span>Screen Reader Mode</span>
              </button>
              <p className="accessibility-description">
                Optimizes for screen readers with additional labels
              </p>
            </div>

            <div className="accessibility-option">
              <button 
                className="accessibility-reset-button"
                onClick={resetAccessibility}
                aria-label="Reset all accessibility settings"
              >
                <FiRefreshCw aria-hidden="true" />
                <span>Reset All</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccessibilityPanel;