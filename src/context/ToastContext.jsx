/**
 * Toast Context
 * 
 * Context for managing toast notifications throughout the application.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  showToast, 
  hideToast, 
  clearAllToasts, 
  selectToasts 
} from '../lib/redux/slices/uiSlice';

// Fallback functions to prevent errors
const noop = () => {};
const defaultContext = {
  toasts: [],
  showSuccess: noop,
  showError: noop,
  showInfo: noop,
  showWarning: noop,
  hideToast: noop,
  clearToasts: noop,
};

// Create context with default values to prevent errors
const ToastContext = createContext(defaultContext);

/**
 * Toast Provider Component
 * 
 * Provides toast notification functionality to the component tree.
 */
export const ToastProvider = ({ children }) => {
  const dispatch = useDispatch();
  // Add local state as a backup in case Redux is not available
  const [localToasts, setLocalToasts] = useState([]);
  
  // Try to get toasts from Redux, fall back to local state
  let toasts = [];
  try {
    toasts = useSelector(selectToasts) || [];
  } catch (error) {
    console.error('Failed to select toasts from Redux store:', error);
    toasts = localToasts;
  }
  
  const showSuccess = (message, options = {}) => {
    try {
      dispatch(showToast({
        type: 'success',
        title: options.title || 'Success',
        message,
        ...options,
      }));
    } catch (error) {
      console.error('Failed to dispatch showToast:', error);
      // Fallback to local state
      const newToast = {
        id: Date.now().toString(),
        type: 'success',
        title: options.title || 'Success',
        message,
        ...options,
      };
      setLocalToasts([...localToasts, newToast]);
    }
  };
  
  const showError = (message, options = {}) => {
    try {
      dispatch(showToast({
        type: 'error',
        title: options.title || 'Error',
        message,
        ...options,
      }));
    } catch (error) {
      console.error('Failed to dispatch showToast:', error);
      // Fallback to local state
      const newToast = {
        id: Date.now().toString(),
        type: 'error',
        title: options.title || 'Error',
        message,
        ...options,
      };
      setLocalToasts([...localToasts, newToast]);
    }
  };
  
  const showInfo = (message, options = {}) => {
    try {
      dispatch(showToast({
        type: 'info',
        title: options.title || 'Information',
        message,
        ...options,
      }));
    } catch (error) {
      console.error('Failed to dispatch showToast:', error);
      // Fallback to local state
      const newToast = {
        id: Date.now().toString(),
        type: 'info',
        title: options.title || 'Information',
        message,
        ...options,
      };
      setLocalToasts([...localToasts, newToast]);
    }
  };
  
  const showWarning = (message, options = {}) => {
    try {
      dispatch(showToast({
        type: 'warning',
        title: options.title || 'Warning',
        message,
        ...options,
      }));
    } catch (error) {
      console.error('Failed to dispatch showToast:', error);
      // Fallback to local state
      const newToast = {
        id: Date.now().toString(),
        type: 'warning',
        title: options.title || 'Warning',
        message,
        ...options,
      };
      setLocalToasts([...localToasts, newToast]);
    }
  };
  
  const hideToastById = (id) => {
    try {
      dispatch(hideToast(id));
    } catch (error) {
      console.error('Failed to dispatch hideToast:', error);
      // Fallback to local state
      setLocalToasts(localToasts.filter(toast => toast.id !== id));
    }
  };
  
  const clearToasts = () => {
    try {
      dispatch(clearAllToasts());
    } catch (error) {
      console.error('Failed to dispatch clearAllToasts:', error);
      // Fallback to local state
      setLocalToasts([]);
    }
  };
  
  // Auto-hide toasts after their duration
  useEffect(() => {
    const displayedToasts = toasts.length > 0 ? toasts : localToasts;
    
    displayedToasts.forEach(toast => {
      if (toast.duration && toast.dismissible !== false) {
        const timerId = setTimeout(() => {
          try {
            hideToastById(toast.id);
          } catch (error) {
            console.error('Failed to auto-hide toast:', error);
          }
        }, toast.duration || 5000);
        
        return () => clearTimeout(timerId);
      }
    });
  }, [toasts, localToasts]);
  
  // Combine Redux toasts and local toasts
  const allToasts = [...(toasts || []), ...(localToasts || [])];
  
  return (
    <ToastContext.Provider value={{
      toasts: allToasts,
      showSuccess,
      showError,
      showInfo,
      showWarning,
      hideToast: hideToastById,
      clearToasts,
    }}>
      {children}
      
      {/* Toast container - can be styled and positioned as needed */}
      {allToasts.length > 0 && (
        <div className="fixed bottom-0 right-0 z-50 p-4 space-y-2">
          {allToasts.map(toast => (
            <div 
              key={toast.id}
              className={`max-w-md p-4 rounded shadow-lg transition-all ${getToastClasses(toast.type)}`}
            >
              {toast.title && (
                <div className="font-semibold">{toast.title}</div>
              )}
              <div>{toast.message}</div>
              {toast.dismissible !== false && (
                <button 
                  onClick={() => hideToastById(toast.id)}
                  className="absolute top-1 right-1 p-1 text-current opacity-70 hover:opacity-100"
                  aria-label="Close"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
};

// Helper function to get toast classes based on type
const getToastClasses = (type) => {
  switch (type) {
    case 'success':
      return 'bg-green-100 text-green-800 border-l-4 border-green-500';
    case 'error':
      return 'bg-red-100 text-red-800 border-l-4 border-red-500';
    case 'warning':
      return 'bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500';
    case 'info':
    default:
      return 'bg-blue-100 text-blue-800 border-l-4 border-blue-500';
  }
};

/**
 * Hook to access the toast context
 * Includes a safety net to prevent errors if used outside provider
 */
export const useToastContext = () => {
  const context = useContext(ToastContext);
  
  // Return a default context if not found to prevent errors
  if (context === undefined) {
    console.warn('useToastContext used outside of ToastProvider, returning a dummy implementation');
    return defaultContext;
  }
  
  return context;
};

export default ToastContext;