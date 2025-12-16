import { createContext, useContext, useReducer, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import PropTypes from 'prop-types';


// Default duration for notifications in milliseconds
const DEFAULT_DURATION = 5000;

// Create a context for notifications
export const NotificationsContext = createContext();

// Action types
const ADD_NOTIFICATION = 'ADD_NOTIFICATION';
const REMOVE_NOTIFICATION = 'REMOVE_NOTIFICATION';

// Notification reducer
const notificationsReducer = (state, action) => {
  switch (action.type) {
    case ADD_NOTIFICATION:
      return [...state, action.payload];
    case REMOVE_NOTIFICATION:
      return state.filter(notification => notification.id !== action.payload);
    default:
      return state;
  }
};

// Notifications Provider component
export const NotificationsProvider = ({ children }) => {
  const [notifications, dispatch] = useReducer(notificationsReducer, []);

  const removeNotification = useCallback((id) => {
    dispatch({ type: REMOVE_NOTIFICATION, payload: id });
  }, []);

  const addNotification = useCallback((message, type, duration = DEFAULT_DURATION) => {
    const id = uuidv4();
    
    dispatch({
      type: ADD_NOTIFICATION,
      payload: {
        id,
        message,
        type,
        duration,
      },
    });
    
    return id;
  }, []);

  // Create helper methods for different notification types
  const notify = {
    success: (message, duration) => addNotification(message, 'success', duration),
    error: (message, duration) => addNotification(message, 'error', duration),
    warning: (message, duration) => addNotification(message, 'warning', duration),
    info: (message, duration) => addNotification(message, 'info', duration),
  };

  return (
    <NotificationsContext.Provider
      value={{ notifications, addNotification, removeNotification, notify }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

// Custom hook to use notifications
export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  
  return context;
};
NotificationsProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export default useNotifications;