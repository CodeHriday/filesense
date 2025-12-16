import React, { createContext, useState, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';

// Create the context
export const AccessibilityContext = createContext();

// Custom hook to use the accessibility context
export const useAccessibility = () => useContext(AccessibilityContext);

// Accessibility provider component
export const AccessibilityProvider = ({ children }) => {
  // Initialize state from localStorage if available, otherwise use defaults
  const [highContrast, setHighContrast] = useState(() => {
    const saved = localStorage.getItem('accessibility_highContrast');
    return saved ? JSON.parse(saved) : false;
  });
  AccessibilityProvider.propTypes = {
  children: PropTypes.node.isRequired
};

  const [largeText, setLargeText] = useState(() => {
    const saved = localStorage.getItem('accessibility_largeText');
    return saved ? JSON.parse(saved) : false;
  });
  
  const [screenReaderOptimized, setScreenReaderOptimized] = useState(() => {
    const saved = localStorage.getItem('accessibility_screenReader');
    return saved ? JSON.parse(saved) : false;
  });
  
  const [reducedMotion, setReducedMotion] = useState(() => {
    const saved = localStorage.getItem('accessibility_reducedMotion');
    return saved ? JSON.parse(saved) : false;
  });
  
  // Listen for system preference changes for reduced motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setReducedMotion(true);
    }
    
    const handleChange = (e) => {
      setReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);
  
  // Save preferences to localStorage when they change
  useEffect(() => {
    localStorage.setItem('accessibility_highContrast', JSON.stringify(highContrast));
    document.documentElement.classList.toggle('high-contrast', highContrast);
  }, [highContrast]);
  
  useEffect(() => {
    localStorage.setItem('accessibility_largeText', JSON.stringify(largeText));
    document.documentElement.classList.toggle('large-text', largeText);
  }, [largeText]);
  
  useEffect(() => {
    localStorage.setItem('accessibility_screenReader', JSON.stringify(screenReaderOptimized));
    document.documentElement.classList.toggle('screen-reader-optimized', screenReaderOptimized);
  }, [screenReaderOptimized]);
  
  useEffect(() => {
    localStorage.setItem('accessibility_reducedMotion', JSON.stringify(reducedMotion));
    document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  }, [reducedMotion]);
  
  // Function to toggle high contrast mode
  const toggleHighContrast = () => {
    setHighContrast(prev => !prev);
  };
  
  // Function to toggle large text mode
  const toggleLargeText = () => {
    setLargeText(prev => !prev);
  };
  
  // Function to toggle screen reader optimization
  const toggleScreenReaderOptimized = () => {
    setScreenReaderOptimized(prev => !prev);
  };
  
  // Function to toggle reduced motion
  const toggleReducedMotion = () => {
    setReducedMotion(prev => !prev);
  };
  
  // Reset all accessibility settings to default
  const resetSettings = () => {
    setHighContrast(false);
    setLargeText(false);
    setScreenReaderOptimized(false);
    setReducedMotion(false);
  };
  
  return (
    <AccessibilityContext.Provider
      value={{
        highContrast,
        largeText,
        screenReaderOptimized,
        reducedMotion,
        toggleHighContrast,
        toggleLargeText,
        toggleScreenReaderOptimized,
        toggleReducedMotion,
        resetSettings
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
};