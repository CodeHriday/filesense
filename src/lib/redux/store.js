/**
 * Redux Store Configuration
 * 
 * This file configures the Redux store with necessary middleware
 * and combines all the application slices.
 */
import { configureStore } from '@reduxjs/toolkit';
import { combineReducers } from 'redux';
import uiReducer from './slices/uiSlice';
import authReducer from './slices/authSlice';
import workflowReducer from './slices/workflowSlice';
import filesReducer from './slices/filesSlice';
import settingsReducer from './slices/settingsSlice';

// Root reducer combining all slice reducers
const rootReducer = combineReducers({
  ui: uiReducer,
  auth: authReducer,
  workflow: workflowReducer,
  files: filesReducer,
  settings: settingsReducer,
});

// Configure store with middleware
export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['ui/showToast', 'files/setFilePreview'],
        // Ignore these field paths in state
        ignoredPaths: ['files.filePreview', 'ui.modals.modalProps'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

// Export store types
export const RootState = store.getState;
export const AppDispatch = store.dispatch;

// Export a hook that can be reused to resolve types
export const useAppDispatch = () => store.dispatch;