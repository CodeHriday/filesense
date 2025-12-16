import React, { createContext, useContext, useState } from 'react';
import './ToastContext.css';
import PropTypes from 'prop-types';


// Create context
const ToastContext = createContext();

// Toast types
const TOAST_TYPES = {
  success: {
    icon: '✓',
    className: 'toast-success'
  },
  error: {
    icon: '✕',
    className: 'toast-error'
  },
  warning: {
    icon: '!',
    className: 'toast-warning'
  },
  info: {
    icon: 'i',
    className: 'toast-info'
  }
};

// Provider component
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  
  // Add a toast
  const addToast = (type, title, message, duration = 5000) => {
    const id = Date.now();
    
    // Add toast to state
    setToasts(prevToasts => [
      ...prevToasts,
      {
        id,
        type,
        title,
        message,
        duration
      }
    ]);
    
    // Remove toast after duration
    if (duration !== Infinity) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    
    return id;
  };
  
  // Remove a toast
  const removeToast = (id) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  };
  
  // Context value
  const value = {
    toasts,
    addToast,
    removeToast
  };
  
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`toast ${TOAST_TYPES[toast.type]?.className || ''}`}
            role="alert"
          >
            <div className="toast-icon">
              {TOAST_TYPES[toast.type]?.icon}
            </div>
            <div className="toast-content">
              {toast.title && <div className="toast-title">{toast.title}</div>}
              <div className="toast-message">{toast.message}</div>
            </div>
            <button 
              className="toast-close" 
              onClick={() => removeToast(toast.id)}
              aria-label="Close toast"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// Hook for using the context
export const useToast = () => {
  const context = useContext(ToastContext);
  
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  
  return context;
};
ToastProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export default ToastContext;