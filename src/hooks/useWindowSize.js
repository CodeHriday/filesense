import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to track window dimensions
 * @param {Object} options - Configuration options
 * @param {number} options.debounceDelay - Debounce delay in milliseconds
 * @returns {Object} Window dimensions and breakpoint helpers
 */
export const useWindowSize = (options = {}) => {
  const { debounceDelay = 250 } = options;
  
  // Initialize with window dimensions, falling back to reasonable defaults for SSR
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });
  
  // Memoize the resize handler to avoid unnecessary rerenders
  const handleResize = useCallback(() => {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);
  
  useEffect(() => {
    // Ensure we're in a browser environment
    if (typeof window === 'undefined') return;
    
    let timeoutId = null;
    
    // Debounced resize handler
    const debouncedResizeHandler = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, debounceDelay);
    };
    
    // Add event listener
    window.addEventListener('resize', debouncedResizeHandler);
    
    // Call handler right away so state gets updated with initial window size
    handleResize();
    
    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('resize', debouncedResizeHandler);
      clearTimeout(timeoutId);
    };
  }, [handleResize, debounceDelay]);
  
  // Standard breakpoints (can be customized based on your needs)
  const breakpoints = {
    xs: 576,   // Extra small devices (portrait phones)
    sm: 768,   // Small devices (landscape phones)
    md: 992,   // Medium devices (tablets)
    lg: 1200,  // Large devices (desktops)
    xl: 1600,  // Extra large devices (large desktops)
  };
  
  // Helper methods for checking breakpoints
  const isExtraSmall = windowSize.width < breakpoints.xs;
  const isSmall = windowSize.width >= breakpoints.xs && windowSize.width < breakpoints.sm;
  const isMedium = windowSize.width >= breakpoints.sm && windowSize.width < breakpoints.md;
  const isLarge = windowSize.width >= breakpoints.md && windowSize.width < breakpoints.lg;
  const isExtraLarge = windowSize.width >= breakpoints.lg && windowSize.width < breakpoints.xl;
  const isHuge = windowSize.width >= breakpoints.xl;
  
  // Utility to check if current width is smaller than a breakpoint
  const isSmallerThan = (breakpoint) => {
    return windowSize.width < breakpoints[breakpoint];
  };
  
  // Utility to check if current width is larger than a breakpoint
  const isLargerThan = (breakpoint) => {
    return windowSize.width >= breakpoints[breakpoint];
  };
  
  return {
    width: windowSize.width,
    height: windowSize.height,
    breakpoints,
    isExtraSmall,
    isSmall,
    isMedium,
    isLarge,
    isExtraLarge,
    isHuge,
    isSmallerThan,
    isLargerThan,
    isPortrait: windowSize.height > windowSize.width,
    isLandscape: windowSize.width >= windowSize.height,
  };
};

export default useWindowSize;