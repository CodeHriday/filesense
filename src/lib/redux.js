/**
 * Redux Configuration
 * 
 * This file sets up the Redux store using Redux Toolkit with optimized
 * configuration for performance and development experience.
 */
import { configureStore } from '@reduxjs/toolkit';

// Import reducers
// We'll create these slices in separate files
const reducers = {
  // We'll add slices as we implement them
};

// Configure the store
export const store = configureStore({
  reducer: reducers,
  // Add middleware here if needed
  middleware: (getDefaultMiddleware) => 
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['persist/PERSIST'],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['meta.arg', 'payload.timestamp'],
        // Ignore these paths in the state
        ignoredPaths: ['items.dates'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

// Export type of RootState
export const RootState = store.getState();

// Export type of AppDispatch
export const AppDispatch = store.dispatch;

export default store;