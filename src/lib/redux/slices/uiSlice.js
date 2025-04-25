/**
 * UI Slice
 * 
 * This slice manages UI-related state like theme, notifications, modals,
 * and other UI elements that need to be tracked globally.
 */
import { createSlice } from '@reduxjs/toolkit';

// Define the initial state
const initialState = {
  theme: localStorage.getItem('theme') || 'light',
  sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
  notifications: [],
  activeModals: [],
  isLoading: false,
  globalError: null,
  // Used for accessibility
  fontSize: localStorage.getItem('fontSize') || 'medium',
  highContrast: localStorage.getItem('highContrast') === 'true',
  reduceMotion: localStorage.getItem('reduceMotion') === 'true',
};

// Create the slice
const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Theme actions
    setTheme: (state, action) => {
      state.theme = action.payload;
      localStorage.setItem('theme', action.payload);
    },
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', state.theme);
    },
    
    // Sidebar actions
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem('sidebarCollapsed', state.sidebarCollapsed);
    },
    setSidebarCollapsed: (state, action) => {
      state.sidebarCollapsed = action.payload;
      localStorage.setItem('sidebarCollapsed', action.payload);
    },
    
    // Notification actions
    addNotification: (state, action) => {
      // Generate unique ID for notification
      const id = Date.now() + Math.random().toString(36).substring(2, 9);
      
      // Add notification with default values if not provided
      state.notifications.push({
        id,
        type: 'info',
        title: '',
        message: '',
        autoClose: true,
        duration: 5000,
        ...action.payload,
        timestamp: Date.now(),
      });
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(
        notification => notification.id !== action.payload
      );
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },
    
    // Modal actions
    openModal: (state, action) => {
      const modalId = action.payload.id || action.payload;
      
      // Add to active modals if not already open
      if (!state.activeModals.includes(modalId)) {
        state.activeModals.push(modalId);
      }
    },
    closeModal: (state, action) => {
      const modalId = action.payload.id || action.payload;
      state.activeModals = state.activeModals.filter(id => id !== modalId);
    },
    closeAllModals: (state) => {
      state.activeModals = [];
    },
    
    // Loading state actions
    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },
    
    // Error state actions
    setGlobalError: (state, action) => {
      state.globalError = action.payload;
    },
    clearGlobalError: (state) => {
      state.globalError = null;
    },
    
    // Accessibility actions
    setFontSize: (state, action) => {
      state.fontSize = action.payload;
      localStorage.setItem('fontSize', action.payload);
    },
    toggleHighContrast: (state) => {
      state.highContrast = !state.highContrast;
      localStorage.setItem('highContrast', state.highContrast);
    },
    toggleReduceMotion: (state) => {
      state.reduceMotion = !state.reduceMotion;
      localStorage.setItem('reduceMotion', state.reduceMotion);
    },
  },
});

// Export actions
export const {
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
} = uiSlice.actions;

// Export selectors
export const selectTheme = (state) => state.ui.theme;
export const selectSidebarCollapsed = (state) => state.ui.sidebarCollapsed;
export const selectNotifications = (state) => state.ui.notifications;
export const selectActiveModals = (state) => state.ui.activeModals;
export const selectIsLoading = (state) => state.ui.isLoading;
export const selectGlobalError = (state) => state.ui.globalError;
export const selectFontSize = (state) => state.ui.fontSize;
export const selectHighContrast = (state) => state.ui.highContrast;
export const selectReduceMotion = (state) => state.ui.reduceMotion;
export const selectIsModalOpen = (id) => (state) => state.ui.activeModals.includes(id);

// Export reducer
export default uiSlice.reducer;