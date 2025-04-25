/**
 * AppProvider Component
 * 
 * This component wraps the application with all required providers.
 * It sets up React Query, Redux, and other contexts.
 */
import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider as ReduxProvider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { store } from './lib/redux/store';
import queryClient from './lib/react-query';
import { AccessibilityProvider } from './context/AccessibilityContext';
import { AnnouncementProvider } from './components/accessibility';
import { ToastProvider } from './context/ToastContext';

// Component that provides all application context providers
const AppProvider = ({ children }) => {
  // Create a properly nested provider structure, careful with the order
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <Router>
          <ToastProvider>
            <AccessibilityProvider>
              <AnnouncementProvider>
                {children}
              </AnnouncementProvider>
            </AccessibilityProvider>
          </ToastProvider>
        </Router>
        {process.env.NODE_ENV !== 'production' && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ReduxProvider>
  );
};

export default AppProvider;