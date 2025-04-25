/**
 * Toast Context
 * 
 * Context for managing toast notifications throughout the application.
 */
import React, { createContext, useContext, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  showToast, 
  hideToast, 
  clearAllToasts, 
  selectToasts 
} from '../lib/redux/slices/uiSlice';

// Create context
const ToastContext = createContext({});

/**
 * Toast Provider Component
 * 
 * Provides toast notification functionality to the component tree.
 */
export const ToastProvider = ({ children }) => {
  const dispatch = useDispatch();
  const toasts = useSelector(selectToasts);
  
  const showSuccess = (message, options = {}) => {
    dispatch(showToast({
      type: 'success',
      title: options.title || 'Success',
      message,
      ...options,
    }));
  };
  
  const showError = (message, options = {}) => {
    dispatch(showToast({
      type: 'error',
      title: options.title || 'Error',
      message,
      ...options,
    }));
  };
  
  const showInfo = (message, options = {}) => {
    dispatch(showToast({
      type: 'info',
      title: options.title || 'Information',
      message,
      ...options,
    }));
  };
  
  const showWarning = (message, options = {}) => {
    dispatch(showToast({
      type: 'warning',
      title: options.title || 'Warning',
      message,
      ...options,
    }));
  };
  
  const hideToastById = (id) => {
    dispatch(hideToast(id));
  };
  
  const clearToasts = () => {
    dispatch(clearAllToasts());
  };
  
  // Auto-hide toasts after their duration
  useEffect(() => {
    toasts.forEach(toast => {
      if (toast.duration && toast.dismissible !== false) {
        const timerId = setTimeout(() => {
          dispatch(hideToast(toast.id));
        }, toast.duration);
        
        return () => clearTimeout(timerId);
      }
    });
  }, [toasts, dispatch]);
  
  return (
    <ToastContext.Provider value={{
      toasts,
      showSuccess,
      showError,
      showInfo,
      showWarning,
      hideToast: hideToastById,
      clearToasts,
    }}>
      {children}
      
      {/* Toast container - can be styled and positioned as needed */}
      <div className="fixed bottom-0 right-0 z-50 p-4 space-y-2">
        {toasts.map(toast => (
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
 */
export const useToastContext = () => {
  const context = useContext(ToastContext);
  
  if (context === undefined) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  
  return context;
};

export default ToastContext;