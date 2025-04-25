/**
 * Auth Slice
 * 
 * Redux slice for managing authentication state, including:
 * - User information
 * - Authentication status
 * - User roles and permissions
 */
import { createSlice } from '@reduxjs/toolkit';

// Initial state
const initialState = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  token: null,
  refreshToken: null,
  roles: [],
  permissions: [],
  error: null,
  lastAction: null,
};

// Create slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Login actions
    loginStart: (state) => {
      state.isLoading = true;
      state.error = null;
      state.lastAction = 'login_start';
    },
    loginSuccess: (state, action) => {
      state.isLoading = false;
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken;
      state.roles = action.payload.roles || [];
      state.permissions = action.payload.permissions || [];
      state.error = null;
      state.lastAction = 'login_success';
    },
    loginFailure: (state, action) => {
      state.isLoading = false;
      state.isAuthenticated = false;
      state.error = action.payload;
      state.lastAction = 'login_failure';
    },
    
    // Logout action
    logout: (state) => {
      // Reset to initial state but keep error if present
      const error = state.error;
      Object.assign(state, { ...initialState, error });
      state.lastAction = 'logout';
    },
    
    // Token refresh actions
    refreshTokenStart: (state) => {
      state.isLoading = true;
      state.lastAction = 'refresh_token_start';
    },
    refreshTokenSuccess: (state, action) => {
      state.isLoading = false;
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken;
      state.lastAction = 'refresh_token_success';
    },
    refreshTokenFailure: (state, action) => {
      // On refresh failure, log the user out but keep the error
      Object.assign(state, { ...initialState, error: action.payload });
      state.lastAction = 'refresh_token_failure';
    },
    
    // User data actions
    updateUserStart: (state) => {
      state.isLoading = true;
      state.lastAction = 'update_user_start';
    },
    updateUserSuccess: (state, action) => {
      state.isLoading = false;
      state.user = { ...state.user, ...action.payload };
      state.lastAction = 'update_user_success';
    },
    updateUserFailure: (state, action) => {
      state.isLoading = false;
      state.error = action.payload;
      state.lastAction = 'update_user_failure';
    },
    
    // Permission and role actions
    setRoles: (state, action) => {
      state.roles = action.payload;
    },
    setPermissions: (state, action) => {
      state.permissions = action.payload;
    },
    
    // Error handling
    clearError: (state) => {
      state.error = null;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    
    // Initialize from localStorage
    initializeAuth: (state, action) => {
      const { user, token, refreshToken, roles, permissions } = action.payload;
      
      if (user && token) {
        state.isAuthenticated = true;
        state.user = user;
        state.token = token;
        state.refreshToken = refreshToken;
        state.roles = roles || [];
        state.permissions = permissions || [];
      }
      
      state.lastAction = 'initialize_auth';
    },
  },
});

// Export actions
export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logout,
  refreshTokenStart,
  refreshTokenSuccess,
  refreshTokenFailure,
  updateUserStart,
  updateUserSuccess,
  updateUserFailure,
  setRoles,
  setPermissions,
  clearError,
  setError,
  initializeAuth,
} = authSlice.actions;

// Selectors
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectIsLoading = (state) => state.auth.isLoading;
export const selectUser = (state) => state.auth.user;
export const selectToken = (state) => state.auth.token;
export const selectRefreshToken = (state) => state.auth.refreshToken;
export const selectRoles = (state) => state.auth.roles;
export const selectPermissions = (state) => state.auth.permissions;
export const selectAuthError = (state) => state.auth.error;
export const selectLastAction = (state) => state.auth.lastAction;

// Utility selector to check if user has a specific role
export const selectHasRole = (state, roleName) => {
  const roles = selectRoles(state);
  return roles?.includes(roleName) || false;
};

// Utility selector to check if user has a specific permission
export const selectHasPermission = (state, permissionName) => {
  const permissions = selectPermissions(state);
  
  // Check if permission is in array format
  if (Array.isArray(permissions)) {
    // Check exact match first
    if (permissions.includes(permissionName)) {
      return true;
    }
    
    // Check for permissions in object format
    for (const perm of permissions) {
      if (typeof perm === 'object' && perm.name === permissionName) {
        return true;
      }
    }
  }
  
  return false;
};

export default authSlice.reducer;