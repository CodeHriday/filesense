import React, { createContext, useState, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';

// Create the accessibility context
const AccessibilityContext = createContext();

// Custom hook for easy context usage
export const useAccessibility = () => useContext(AccessibilityContext);

// Provider component
export const AccessibilityProvider = ({ children }) => {
  // Get initial state from localStorage if available
  const [highContrast, setHighContrast] = useState(() => {
    const saved = localStorage.getItem('dfo-high-contrast');
    return saved === 'true';
  });
  
  const [largeText, setLargeText] = useState(() => {
    const saved = localStorage.getItem('dfo-large-text');
    return saved === 'true';
  });
  
  const [screenReaderOptimized, setScreenReaderOptimized] = useState(() => {
    const saved = localStorage.getItem('dfo-screen-reader');
    return saved === 'true';
  });

  // Update localStorage when preferences change
  useEffect(() => {
    localStorage.setItem('dfo-high-contrast', highContrast);
    
    // Apply high contrast mode to the root element
    if (highContrast) {
      document.documentElement.classList.add('high-contrast-mode');
    } else {
      document.documentElement.classList.remove('high-contrast-mode');
    }
  }, [highContrast]);

  useEffect(() => {
    localStorage.setItem('dfo-large-text', largeText);
    
    // Apply large text mode to the root element
    if (largeText) {
      document.documentElement.classList.add('large-text-mode');
    } else {
      document.documentElement.classList.remove('large-text-mode');
    }
  }, [largeText]);

  useEffect(() => {
    localStorage.setItem('dfo-screen-reader', screenReaderOptimized);
    
    // Apply screen reader optimized mode to the root element
    if (screenReaderOptimized) {
      document.documentElement.classList.add('screen-reader-mode');
    } else {
      document.documentElement.classList.remove('screen-reader-mode');
    }
  }, [screenReaderOptimized]);

  // Toggle functions
  const toggleHighContrast = () => setHighContrast(prev => !prev);
  const toggleLargeText = () => setLargeText(prev => !prev);
  const toggleScreenReaderOptimized = () => setScreenReaderOptimized(prev => !prev);

  // Reset to defaults
  const resetAccessibility = () => {
    setHighContrast(false);
    setLargeText(false);
    setScreenReaderOptimized(false);
  };

  const value = {
    highContrast,
    largeText,
    screenReaderOptimized,
    toggleHighContrast,
    toggleLargeText,
    toggleScreenReaderOptimized,
    resetAccessibility
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
};
AccessibilityProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export default AccessibilityContext;