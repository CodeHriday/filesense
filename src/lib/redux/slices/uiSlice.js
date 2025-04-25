/**
 * UI Slice
 * 
 * Redux slice for managing global UI state such as:
 * - Sidebar open/closed state
 * - Theme settings
 * - Modal visibility
 * - Toast notifications
 * - Loading states
 */
import { createSlice } from '@reduxjs/toolkit';

// Initial state
const initialState = {
  sidebar: {
    open: true,
    collapsed: false,
  },
  theme: {
    mode: 'light', // 'light' or 'dark'
    primaryColor: 'blue',
    fontSize: 'medium', // 'small', 'medium', 'large'
    reducedMotion: false,
    highContrast: false,
  },
  modals: {
    activeModals: [], // Array of active modal IDs
    modalProps: {}, // Props for modals keyed by modal ID
  },
  toasts: [], // Array of toast notifications
  loading: {
    global: false,
    byId: {}, // Loading states keyed by ID
  },
  accessibility: {
    textSize: 'medium', // 'small', 'medium', 'large'
    contrast: 'normal', // 'normal', 'high'
    reducedMotion: false,
  },
};

// Helper to generate unique IDs for toasts
let toastId = 0;
const getNextToastId = () => {
  toastId += 1;
  return `toast-${toastId}`;
};

// Create slice
const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Sidebar actions
    toggleSidebar: (state) => {
      state.sidebar.open = !state.sidebar.open;
    },
    setSidebarOpen: (state, action) => {
      state.sidebar.open = action.payload;
    },
    toggleSidebarCollapsed: (state) => {
      state.sidebar.collapsed = !state.sidebar.collapsed;
    },
    setSidebarCollapsed: (state, action) => {
      state.sidebar.collapsed = action.payload;
    },
    
    // Theme actions
    setThemeMode: (state, action) => {
      state.theme.mode = action.payload;
    },
    setPrimaryColor: (state, action) => {
      state.theme.primaryColor = action.payload;
    },
    setFontSize: (state, action) => {
      state.theme.fontSize = action.payload;
    },
    toggleReducedMotion: (state) => {
      state.theme.reducedMotion = !state.theme.reducedMotion;
    },
    toggleHighContrast: (state) => {
      state.theme.highContrast = !state.theme.highContrast;
    },
    
    // Modal actions
    openModal: (state, action) => {
      const { modalId, props = {} } = action.payload;
      
      // Add modal to active modals if not already open
      if (!state.modals.activeModals.includes(modalId)) {
        state.modals.activeModals.push(modalId);
      }
      
      // Set modal props
      state.modals.modalProps[modalId] = props;
    },
    closeModal: (state, action) => {
      const modalId = action.payload;
      
      // Remove modal from active modals
      state.modals.activeModals = state.modals.activeModals.filter(id => id !== modalId);
      
      // Clean up props
      delete state.modals.modalProps[modalId];
    },
    closeAllModals: (state) => {
      state.modals.activeModals = [];
      state.modals.modalProps = {};
    },
    
    // Toast actions
    showToast: {
      reducer: (state, action) => {
        const { id, ...rest } = action.payload;
        state.toasts.push({ id, ...rest });
      },
      prepare: (toast) => {
        // Generate ID if not provided
        const id = toast.id || getNextToastId();
        return {
          payload: {
            id,
            type: toast.type || 'info',
            title: toast.title || '',
            message: toast.message || '',
            duration: toast.duration || 5000, // 5 seconds by default
            dismissible: toast.dismissible !== false, // Dismissible by default
            timestamp: Date.now(),
            ...toast,
          },
        };
      },
    },
    hideToast: (state, action) => {
      const toastId = action.payload;
      state.toasts = state.toasts.filter(toast => toast.id !== toastId);
    },
    clearAllToasts: (state) => {
      state.toasts = [];
    },
    
    // Loading actions
    setGlobalLoading: (state, action) => {
      state.loading.global = action.payload;
    },
    setLoading: (state, action) => {
      const { id, isLoading } = action.payload;
      state.loading.byId[id] = isLoading;
    },
    clearLoading: (state, action) => {
      const id = action.payload;
      delete state.loading.byId[id];
    },
    clearAllLoading: (state) => {
      state.loading.global = false;
      state.loading.byId = {};
    },
    
    // Accessibility actions
    setTextSize: (state, action) => {
      state.accessibility.textSize = action.payload;
    },
    setContrast: (state, action) => {
      state.accessibility.contrast = action.payload;
    },
    setReducedMotion: (state, action) => {
      state.accessibility.reducedMotion = action.payload;
    },
    resetAccessibility: (state) => {
      state.accessibility = initialState.accessibility;
    },
  },
});

// Export actions
export const {
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
  clearAllLoading,
  setTextSize,
  setContrast,
  setReducedMotion,
  resetAccessibility,
} = uiSlice.actions;

// Selectors
export const selectSidebarOpen = (state) => state.ui.sidebar.open;
export const selectSidebarCollapsed = (state) => state.ui.sidebar.collapsed;
export const selectThemeMode = (state) => state.ui.theme.mode;
export const selectPrimaryColor = (state) => state.ui.theme.primaryColor;
export const selectFontSize = (state) => state.ui.theme.fontSize;
export const selectReducedMotion = (state) => state.ui.theme.reducedMotion;
export const selectHighContrast = (state) => state.ui.theme.highContrast;
export const selectActiveModals = (state) => state.ui.modals.activeModals;
export const selectModalProps = (state, modalId) => state.ui.modals.modalProps[modalId] || {};
export const selectToasts = (state) => state.ui.toasts;
export const selectGlobalLoading = (state) => state.ui.loading.global;
export const selectLoadingById = (state, id) => state.ui.loading.byId[id] || false;
export const selectAccessibility = (state) => state.ui.accessibility;

export default uiSlice.reducer;