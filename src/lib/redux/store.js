/**
 * Redux Store Configuration
 * 
 * This file sets up the Redux store with Redux Toolkit and
 * configures middleware and enhancers.
 */
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

// Import reducers
import uiReducer from './slices/uiSlice';
import authReducer from './slices/authSlice';

// Configure the store
export const store = configureStore({
  reducer: {
    ui: uiReducer,
    auth: authReducer,
    // Add more reducers here as they are created
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['ui/setNotification'],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['payload.timestamp', 'meta.arg'],
        // Ignore these paths in the state
        ignoredPaths: ['ui.notifications'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

// Setup listeners for RTK-Query (if used later)
setupListeners(store.dispatch);

export default store;