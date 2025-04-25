/**
 * UI-related React hooks
 * 
 * This file contains hooks for managing UI state through Redux Toolkit,
 * including theme, notifications, modals, and loading states.
 */
import { useSelector, useDispatch } from 'react-redux';
import { 
  setTheme,
  toggleTheme,
  toggleSidebar, 
  setSidebarCollapsed,
  addNotification, 
  removeNotification,
  clearNotifications,
  openModal,
  closeModal,
  closeAllModals,
  setLoading, 
  setGlobalError,
  clearGlobalError,
  setFontSize,
  toggleHighContrast,
  toggleReduceMotion,
  selectTheme,
  selectSidebarCollapsed,
  selectNotifications,
  selectActiveModals,
  selectIsLoading,
  selectGlobalError,
  selectFontSize,
  selectHighContrast,
  selectReduceMotion,
  selectIsModalOpen
} from '../lib/redux/slices/uiSlice';

/**
 * Hook for accessing and managing theme
 */
export const useTheme = () => {
  const dispatch = useDispatch();
  const theme = useSelector(selectTheme);
  
  const setActiveTheme = (newTheme) => {
    dispatch(setTheme(newTheme));
    
    // Apply theme to body element
    document.body.setAttribute('data-theme', newTheme);
  };
  
  const toggle = () => {
    dispatch(toggleTheme());
    
    // Apply updated theme to body element
    const newTheme = theme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', newTheme);
  };
  
  return { theme, setTheme: setActiveTheme, toggleTheme: toggle };
};

/**
 * Hook for managing sidebar state
 */
export const useSidebar = () => {
  const dispatch = useDispatch();
  const isCollapsed = useSelector(selectSidebarCollapsed);
  
  const toggle = () => dispatch(toggleSidebar());
  const setCollapsed = (collapsed) => dispatch(setSidebarCollapsed(collapsed));
  
  return { isCollapsed, toggleSidebar: toggle, setSidebarCollapsed: setCollapsed };
};

/**
 * Hook for managing notifications
 */
export const useNotifications = () => {
  const dispatch = useDispatch();
  const notifications = useSelector(selectNotifications);
  
  const add = (notification) => dispatch(addNotification(notification));
  const remove = (id) => dispatch(removeNotification(id));
  const clear = () => dispatch(clearNotifications());
  
  // Helper methods for common notification types
  const showSuccess = (message, options = {}) => {
    dispatch(addNotification({
      type: 'success', 
      title: options.title || 'Success',
      message,
      ...options
    }));
  };
  
  const showError = (message, options = {}) => {
    dispatch(addNotification({
      type: 'error', 
      title: options.title || 'Error',
      message,
      ...options
    }));
  };
  
  const showWarning = (message, options = {}) => {
    dispatch(addNotification({
      type: 'warning', 
      title: options.title || 'Warning',
      message,
      ...options
    }));
  };
  
  const showInfo = (message, options = {}) => {
    dispatch(addNotification({
      type: 'info', 
      title: options.title || 'Information',
      message,
      ...options
    }));
  };
  
  return { 
    notifications, 
    addNotification: add, 
    removeNotification: remove, 
    clearNotifications: clear,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
};

/**
 * Hook for managing modals
 */
export const useModal = () => {
  const dispatch = useDispatch();
  const activeModals = useSelector(selectActiveModals);
  
  const open = (modalId) => dispatch(openModal(modalId));
  const close = (modalId) => dispatch(closeModal(modalId));
  const closeAll = () => dispatch(closeAllModals());
  
  // Function to check if a specific modal is open
  const isOpen = (modalId) => {
    return useSelector(selectIsModalOpen(modalId));
  };
  
  return { activeModals, openModal: open, closeModal: close, closeAllModals: closeAll, isModalOpen: isOpen };
};

/**
 * Hook for managing global loading state
 */
export const useLoading = () => {
  const dispatch = useDispatch();
  const isLoading = useSelector(selectIsLoading);
  
  const setIsLoading = (loading) => dispatch(setLoading(loading));
  
  return { isLoading, setLoading: setIsLoading };
};

/**
 * Hook for managing global error state
 */
export const useGlobalError = () => {
  const dispatch = useDispatch();
  const globalError = useSelector(selectGlobalError);
  
  const setError = (error) => dispatch(setGlobalError(error));
  const clearError = () => dispatch(clearGlobalError());
  
  return { globalError, setGlobalError: setError, clearGlobalError: clearError };
};

/**
 * Hook for managing accessibility settings
 */
export const useAccessibility = () => {
  const dispatch = useDispatch();
  const fontSize = useSelector(selectFontSize);
  const highContrast = useSelector(selectHighContrast);
  const reduceMotion = useSelector(selectReduceMotion);
  
  const setSize = (size) => dispatch(setFontSize(size));
  const toggleContrast = () => dispatch(toggleHighContrast());
  const toggleMotion = () => dispatch(toggleReduceMotion());
  
  // Apply accessibility settings to body element
  const applyAccessibilitySettings = () => {
    // Apply font size
    document.body.setAttribute('data-font-size', fontSize);
    
    // Apply high contrast
    if (highContrast) {
      document.body.setAttribute('data-high-contrast', 'true');
    } else {
      document.body.removeAttribute('data-high-contrast');
    }
    
    // Apply reduced motion
    if (reduceMotion) {
      document.body.setAttribute('data-reduce-motion', 'true');
    } else {
      document.body.removeAttribute('data-reduce-motion');
    }
  };
  
  return { 
    fontSize, 
    highContrast, 
    reduceMotion,
    setFontSize: setSize,
    toggleHighContrast: toggleContrast,
    toggleReduceMotion: toggleMotion,
    applyAccessibilitySettings
  };
};