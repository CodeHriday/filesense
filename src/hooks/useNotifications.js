import { useState, useCallback, useContext, createContext } from 'react';

// Create Context
const NotificationContext = createContext();

/**
 * Notification provider component
 * Wrap your app with this provider to enable notifications
 */
export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  
  // Add a notification
  const addNotification = useCallback((notification) => {
    const id = Date.now().toString();
    const newNotification = {
      id,
      message: notification.message || 'Notification',
      type: notification.type || 'info', // 'success', 'error', 'warning', 'info'
      duration: notification.duration || 5000, // milliseconds
      ...notification
    };
    
    setNotifications(prev => [...prev, newNotification]);
    
    // Auto-dismiss notification after duration
    if (newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }
    
    return id;
  }, []);
  
  // Remove a notification by ID
  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);
  
  // Remove all notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);
  
  // Shorthand for common notification types
  const notify = {
    success: useCallback((message, options = {}) => {
      return addNotification({ message, type: 'success', ...options });
    }, [addNotification]),
    
    error: useCallback((message, options = {}) => {
      return addNotification({ message, type: 'error', ...options });
    }, [addNotification]),
    
    warning: useCallback((message, options = {}) => {
      return addNotification({ message, type: 'warning', ...options });
    }, [addNotification]),
    
    info: useCallback((message, options = {}) => {
      return addNotification({ message, type: 'info', ...options });
    }, [addNotification])
  };
  
  const value = {
    notifications,
    addNotification,
    removeNotification,
    clearNotifications,
    notify
  };
  
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

/**
 * Custom hook for accessing and managing notifications
 * Must be used within a NotificationProvider
 */
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  
  return context;
};

export default useNotifications;