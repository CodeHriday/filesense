/**
 * Accessibility Context
 * 
 * Context for managing and applying accessibility settings throughout the application.
 */
import React, { createContext, useContext, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectAccessibility,
  setTextSize,
  setContrast,
  setReducedMotion,
} from '../lib/redux/slices/uiSlice';

// Create context
const AccessibilityContext = createContext({});

/**
 * Accessibility Provider Component
 * 
 * Provides accessibility settings and methods to the component tree.
 */
export const AccessibilityProvider = ({ children }) => {
  const dispatch = useDispatch();
  const accessibilitySettings = useSelector(selectAccessibility);
  
  const accessibility = {
    ...accessibilitySettings,
    setTextSize: (size) => dispatch(setTextSize(size)),
    setContrast: (contrast) => dispatch(setContrast(contrast)),
    setReducedMotion: (reduced) => dispatch(setReducedMotion(reduced)),
    applyAccessibilitySettings: () => {
      // Apply text size
      document.documentElement.style.fontSize = {
        small: '14px',
        medium: '16px',
        large: '18px',
      }[accessibilitySettings.textSize] || '16px';
      
      // Apply contrast
      document.body.classList.toggle('high-contrast', accessibilitySettings.contrast === 'high');
      
      // Apply reduced motion
      document.body.classList.toggle('reduced-motion', accessibilitySettings.reducedMotion);
      
      if (accessibilitySettings.reducedMotion) {
        document.body.style.setProperty('--transition-duration', '0s');
      } else {
        document.body.style.removeProperty('--transition-duration');
      }
    }
  };
  
  // Apply accessibility settings when they change
  useEffect(() => {
    accessibility.applyAccessibilitySettings();
  }, [
    accessibilitySettings.textSize,
    accessibilitySettings.contrast,
    accessibilitySettings.reducedMotion,
  ]);
  
  return (
    <AccessibilityContext.Provider value={accessibility}>
      {children}
    </AccessibilityContext.Provider>
  );
};

/**
 * Hook to access the accessibility context
 */
export const useAccessibilityContext = () => {
  const context = useContext(AccessibilityContext);
  
  if (context === undefined) {
    throw new Error('useAccessibilityContext must be used within an AccessibilityProvider');
  }
  
  return context;
};

export default AccessibilityContext;