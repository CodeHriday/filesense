/**
 * AppProvider Component
 * 
 * This component wraps the application with all required providers.
 * It sets up React Query, Redux, and other contexts.
 */
import React, { useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider as ReduxProvider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { store } from './lib/redux/store';
import queryClient from './lib/react-query';
import { AccessibilityProvider } from './context/AccessibilityContext';
import { AnnouncementProvider } from './components/accessibility';
import { ToastProvider } from './context/ToastContext';
import { useTheme } from './hooks/useUI';
import { useAccessibility } from './hooks/useUI';

// Wrapper to apply theme and accessibility settings
const ThemeWrapper = ({ children }) => {
  const { theme } = useTheme();
  const { applyAccessibilitySettings } = useAccessibility();
  
  // Apply theme and accessibility settings on mount
  useEffect(() => {
    // Apply theme to body
    document.body.setAttribute('data-theme', theme);
    
    // Apply accessibility settings
    applyAccessibilitySettings();
  }, [theme, applyAccessibilitySettings]);
  
  return children;
};

const AppProvider = ({ children }) => {
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <AccessibilityProvider>
          <AnnouncementProvider>
            <ToastProvider>
              <ThemeWrapper>
                <Router>
                  {children}
                </Router>
              </ThemeWrapper>
            </ToastProvider>
          </AnnouncementProvider>
        </AccessibilityProvider>
        {process.env.NODE_ENV !== 'production' && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ReduxProvider>
  );
};

export default AppProvider;