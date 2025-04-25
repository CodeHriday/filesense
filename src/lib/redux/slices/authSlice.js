/**
 * Auth Slice
 * 
 * This slice manages authentication state including user data,
 * permissions, and auth status.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { API_BASE_URL } from '../../../config';

// Define async thunks for authentication operations
export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        return rejectWithValue('No token found');
      }
      
      const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      return response.data;
    } catch (error) {
      // Handle token expiration or other errors
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        localStorage.removeItem('token');
      }
      
      return rejectWithValue(
        error.response?.data?.message || 
        error.message || 
        'Failed to fetch user data'
      );
    }
  }
);

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      // Normalize username to lowercase
      const normalizedUsername = username.toLowerCase();
      
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        username: normalizedUsername,
        password
      });
      
      const { token, user, refreshToken } = response.data;
      
      if (!token || !user) {
        return rejectWithValue('Invalid response format from server');
      }
      
      // Save tokens to localStorage
      localStorage.setItem('token', token);
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      }
      
      // Get complete user data with permissions
      try {
        const userResponse = await axios.get(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        return userResponse.data;
      } catch (userError) {
        // Fall back to basic user data
        return user;
      }
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 
        error.message || 
        'Invalid username or password'
      );
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (token) {
        try {
          await axios.post(`${API_BASE_URL}/api/auth/logout`, 
            { refreshToken },
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );
        } catch (error) {
          console.error('Error during logout API call:', error);
          // Continue with local logout even if API call fails
        }
      }
      
      // Always clear local storage
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      
      return true;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 
        error.message || 
        'Logout failed'
      );
    }
  }
);

// Define the initial state
const initialState = {
  user: null,
  loading: false,
  isAuthenticated: false,
  error: null,
  permissions: [],
  roles: [],
};

// Create the slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Reset auth state
    resetAuth: () => initialState,
    
    // Set auth error message
    setAuthError: (state, action) => {
      state.error = action.payload;
    },
    
    // Clear auth error message
    clearAuthError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login user
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
        state.roles = action.payload.roles || [];
        state.permissions = action.payload.permissions || [];
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.error = action.payload || 'Login failed';
      })
      
      // Fetch current user
      .addCase(fetchCurrentUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
        state.roles = action.payload.roles || [];
        state.permissions = action.payload.permissions || [];
        state.error = null;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.error = action.payload || 'Failed to fetch user data';
      })
      
      // Logout user
      .addCase(logoutUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.roles = [];
        state.permissions = [];
        state.error = null;
      })
      .addCase(logoutUser.rejected, (state) => {
        // Even if API logout fails, still clear the local state
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.roles = [];
        state.permissions = [];
        state.error = null;
      });
  },
});

// Export actions
export const { resetAuth, setAuthError, clearAuthError } = authSlice.actions;

// Export selectors
export const selectUser = (state) => state.auth.user;
export const selectAuthLoading = (state) => state.auth.loading;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectAuthError = (state) => state.auth.error;
export const selectUserRoles = (state) => state.auth.roles;
export const selectUserPermissions = (state) => state.auth.permissions;

// Helper selectors for checking permissions and roles
export const selectHasRole = (role) => (state) => {
  const roles = state.auth.roles || [];
  
  if (typeof roles === 'string') {
    return roles === role;
  }
  
  if (Array.isArray(roles)) {
    return roles.includes(role);
  }
  
  return false;
};

export const selectHasPermission = (permission) => (state) => {
  const permissions = state.auth.permissions || [];
  
  // Check for direct match
  if (permissions.includes(permission)) {
    return true;
  }
  
  // Check for admin role which has all permissions
  if (state.auth.roles?.includes('Admin')) {
    return true;
  }
  
  // Check for object-style permissions
  if (permissions.some(p => typeof p === 'object' && p?.name === permission)) {
    return true;
  }
  
  // Parse resource:action format
  if (permission.includes(':')) {
    const [resource, action] = permission.split(':');
    
    return permissions.some(p => {
      if (typeof p === 'string' && p.includes(':')) {
        const [pResource, pAction] = p.split(':');
        return (pResource === resource || pResource === '*') && 
               (pAction === action || pAction === '*');
      }
      return false;
    });
  }
  
  return false;
};

// Export reducer
export default authSlice.reducer;