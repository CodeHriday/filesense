/**
 * UI Hook
 * 
 * Custom hooks for managing UI-related state and operations.
 */
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  toggleSidebar,
  setSidebarOpen,
  toggleSidebarCollapsed,
  setSidebarCollapsed,
  setThemeMode,
  setPrimaryColor,
  setFontSize,
  toggleReducedMotion,
  toggleHighContrast,
  openModal,
  closeModal,
  closeAllModals,
  showToast,
  hideToast,
  clearAllToasts,
  setGlobalLoading,
  setLoading,
  clearLoading,
  setTextSize,
  setContrast,
  setReducedMotion,
  selectSidebarOpen,
  selectSidebarCollapsed,
  selectThemeMode,
  selectPrimaryColor,
  selectFontSize,
  selectReducedMotion,
  selectHighContrast,
  selectActiveModals,
  selectModalProps,
  selectToasts,
  selectGlobalLoading,
  selectLoadingById,
  selectAccessibility
} from '../lib/redux/slices/uiSlice';

/**
 * Hook for managing sidebar state
 */
export const useSidebar = () => {
  const dispatch = useDispatch();
  const isOpen = useSelector(selectSidebarOpen);
  const isCollapsed = useSelector(selectSidebarCollapsed);
  
  const toggle = useCallback(() => {
    dispatch(toggleSidebar());
  }, [dispatch]);
  
  const open = useCallback(() => {
    dispatch(setSidebarOpen(true));
  }, [dispatch]);
  
  const close = useCallback(() => {
    dispatch(setSidebarOpen(false));
  }, [dispatch]);
  
  const toggleCollapsed = useCallback(() => {
    dispatch(toggleSidebarCollapsed());
  }, [dispatch]);
  
  const expand = useCallback(() => {
    dispatch(setSidebarCollapsed(false));
  }, [dispatch]);
  
  const collapse = useCallback(() => {
    dispatch(setSidebarCollapsed(true));
  }, [dispatch]);
  
  return {
    isOpen,
    isCollapsed,
    toggle,
    open,
    close,
    toggleCollapsed,
    expand,
    collapse,
  };
};

/**
 * Hook for managing theme settings
 */
export const useTheme = () => {
  const dispatch = useDispatch();
  const theme = useSelector(selectThemeMode);
  const primaryColor = useSelector(selectPrimaryColor);
  const fontSize = useSelector(selectFontSize);
  const reducedMotion = useSelector(selectReducedMotion);
  const highContrast = useSelector(selectHighContrast);
  
  const setTheme = useCallback((mode) => {
    dispatch(setThemeMode(mode));
  }, [dispatch]);
  
  const toggleTheme = useCallback(() => {
    dispatch(setThemeMode(theme === 'light' ? 'dark' : 'light'));
  }, [dispatch, theme]);
  
  const setPrimary = useCallback((color) => {
    dispatch(setPrimaryColor(color));
  }, [dispatch]);
  
  const setFontSizeOption = useCallback((size) => {
    dispatch(setFontSize(size));
  }, [dispatch]);
  
  const toggleMotion = useCallback(() => {
    dispatch(toggleReducedMotion());
  }, [dispatch]);
  
  const toggleContrast = useCallback(() => {
    dispatch(toggleHighContrast());
  }, [dispatch]);
  
  return {
    theme,
    isDark: theme === 'dark',
    isLight: theme === 'light',
    primaryColor,
    fontSize,
    reducedMotion,
    highContrast,
    setTheme,
    toggleTheme,
    setPrimaryColor: setPrimary,
    setFontSize: setFontSizeOption,
    toggleReducedMotion: toggleMotion,
    toggleHighContrast: toggleContrast,
  };
};

/**
 * Hook for managing modals
 */
export const useModal = (modalId) => {
  const dispatch = useDispatch();
  const activeModals = useSelector(selectActiveModals);
  const modalProps = useSelector((state) => selectModalProps(state, modalId));
  
  const isOpen = useCallback(() => {
    return modalId ? activeModals.includes(modalId) : activeModals.length > 0;
  }, [activeModals, modalId]);
  
  const open = useCallback((props = {}) => {
    if (!modalId) {
      throw new Error('modalId is required to open a modal');
    }
    dispatch(openModal({ modalId, props }));
  }, [dispatch, modalId]);
  
  const close = useCallback(() => {
    if (modalId) {
      dispatch(closeModal(modalId));
    } else {
      dispatch(closeAllModals());
    }
  }, [dispatch, modalId]);
  
  return {
    isOpen: isOpen(),
    open,
    close,
    props: modalProps,
  };
};

/**
 * Hook for managing toasts
 */
export const useToast = () => {
  const dispatch = useDispatch();
  const toasts = useSelector(selectToasts);
  
  const showSuccessToast = useCallback((message, options = {}) => {
    dispatch(showToast({
      type: 'success',
      title: options.title || 'Success',
      message,
      ...options,
    }));
  }, [dispatch]);
  
  const showErrorToast = useCallback((message, options = {}) => {
    dispatch(showToast({
      type: 'error',
      title: options.title || 'Error',
      message,
      ...options,
    }));
  }, [dispatch]);
  
  const showInfoToast = useCallback((message, options = {}) => {
    dispatch(showToast({
      type: 'info',
      title: options.title || 'Information',
      message,
      ...options,
    }));
  }, [dispatch]);
  
  const showWarningToast = useCallback((message, options = {}) => {
    dispatch(showToast({
      type: 'warning',
      title: options.title || 'Warning',
      message,
      ...options,
    }));
  }, [dispatch]);
  
  const hideToastById = useCallback((id) => {
    dispatch(hideToast(id));
  }, [dispatch]);
  
  const clearToasts = useCallback(() => {
    dispatch(clearAllToasts());
  }, [dispatch]);
  
  return {
    toasts,
    showSuccess: showSuccessToast,
    showError: showErrorToast,
    showInfo: showInfoToast,
    showWarning: showWarningToast,
    hideToast: hideToastById,
    clearToasts,
  };
};

/**
 * Hook for managing loading states
 */
export const useLoading = (id) => {
  const dispatch = useDispatch();
  const globalLoading = useSelector(selectGlobalLoading);
  const idLoading = id ? useSelector((state) => selectLoadingById(state, id)) : false;
  
  const setGlobal = useCallback((isLoading) => {
    dispatch(setGlobalLoading(isLoading));
  }, [dispatch]);
  
  const setById = useCallback((loadingId, isLoading) => {
    dispatch(setLoading({ id: loadingId, isLoading }));
  }, [dispatch]);
  
  const clearById = useCallback((loadingId) => {
    dispatch(clearLoading(loadingId));
  }, [dispatch]);
  
  const startLoading = useCallback(() => {
    if (id) {
      setById(id, true);
    } else {
      setGlobal(true);
    }
  }, [id, setById, setGlobal]);
  
  const stopLoading = useCallback(() => {
    if (id) {
      setById(id, false);
    } else {
      setGlobal(false);
    }
  }, [id, setById, setGlobal]);
  
  return {
    isLoading: id ? idLoading : globalLoading,
    startLoading,
    stopLoading,
    setGlobalLoading: setGlobal,
    setLoadingById: setById,
    clearLoadingById: clearById,
  };
};

/**
 * Hook for managing accessibility settings
 */
export const useAccessibility = () => {
  const dispatch = useDispatch();
  const accessibility = useSelector(selectAccessibility);
  
  const setTextSizeOption = useCallback((size) => {
    dispatch(setTextSize(size));
  }, [dispatch]);
  
  const setContrastOption = useCallback((contrast) => {
    dispatch(setContrast(contrast));
  }, [dispatch]);
  
  const setReducedMotionOption = useCallback((reduced) => {
    dispatch(setReducedMotion(reduced));
  }, [dispatch]);
  
  const applyAccessibilitySettings = useCallback(() => {
    // Apply text size
    document.documentElement.style.fontSize = {
      small: '14px',
      medium: '16px',
      large: '18px',
    }[accessibility.textSize] || '16px';
    
    // Apply contrast
    document.body.classList.toggle('high-contrast', accessibility.contrast === 'high');
    
    // Apply reduced motion
    document.body.classList.toggle('reduced-motion', accessibility.reducedMotion);
    
    if (accessibility.reducedMotion) {
      document.body.style.setProperty('--transition-duration', '0s');
    } else {
      document.body.style.removeProperty('--transition-duration');
    }
  }, [accessibility]);
  
  return {
    ...accessibility,
    setTextSize: setTextSizeOption,
    setContrast: setContrastOption,
    setReducedMotion: setReducedMotionOption,
    applyAccessibilitySettings,
  };
};

/**
 * Combined hook for UI operations
 */
export const useUI = () => {
  const sidebar = useSidebar();
  const theme = useTheme();
  const toast = useToast();
  const loading = useLoading();
  const accessibility = useAccessibility();
  
  return {
    sidebar,
    theme,
    toast,
    loading,
    accessibility,
  };
};

export default useUI;