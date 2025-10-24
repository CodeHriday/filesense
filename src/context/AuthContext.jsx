import React, { createContext, useState, useEffect, useContext, useRef, useReducer } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import PropTypes from 'prop-types';
import ForcePasswordChange from '../components/ForcePasswordChange';

// Create context
const AuthContext = createContext(null);

// Auth status constants for atomic state transitions - exported for use in routing
export const AUTH_STATUS = {
  CHECKING: 'checking',      // Initial state, validating token
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated'
};

// Reducer action types
const AUTH_ACTIONS = {
  AUTH_SUCCESS: 'AUTH_SUCCESS',
  AUTH_FAILURE: 'AUTH_FAILURE',
  LOGOUT: 'LOGOUT',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR'
};

// Initial auth state
const initialAuthState = {
  status: AUTH_STATUS.CHECKING,
  user: null,
  error: ''
};

/**
 * Helper function to check if a user has admin-level access
 * Admin access is purely role-based - only users with the "Admin" role have admin-level access
 * @param {Object} user - User object with roles and permissions
 * @returns {boolean}
 */
const hasAdminLevelAccess = (user) => {
  if (!user) return false;
  
  // Check for Admin role only - admin access is purely role-based
  if (user.roles && (
    user.roles.includes('Admin') || 
    user.roles.includes('admin')
  )) {
    return true;
  }
  
  return false;
};

// Auth reducer for atomic state updates
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.AUTH_SUCCESS:
      return {
        ...state,
        status: AUTH_STATUS.AUTHENTICATED,
        user: action.payload.user,
        error: ''
      };
    case AUTH_ACTIONS.AUTH_FAILURE:
      return {
        ...state,
        status: AUTH_STATUS.UNAUTHENTICATED,
        user: null,
        error: action.payload?.error || ''
      };
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        status: AUTH_STATUS.UNAUTHENTICATED,
        user: null,
        error: ''
      };
    case AUTH_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload.error
      };
    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: ''
      };
    default:
      return state;
  }
}

// Custom hook for using the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [authState, dispatch] = useReducer(authReducer, initialAuthState);
  const [showForcePasswordChange, setShowForcePasswordChange] = useState(false);
  
  // Ref to track if initial auth check is in progress
  // This prevents the response interceptor from interfering during initialization
  const isInitializingRef = useRef(true);
  
  // Derived state for backward compatibility
  const currentUser = authState.user;
  const loading = authState.status === AUTH_STATUS.CHECKING;
  const error = authState.error;
  const authStatus = authState.status;
  
  // Check if there's a token in localStorage on initial load
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (token) {
      fetchUserData(token);
    } else {
      isInitializingRef.current = false;
      dispatch({ type: AUTH_ACTIONS.AUTH_FAILURE });
    }
  }, []);
  
  AuthProvider.propTypes = {
    children: PropTypes.node.isRequired
  };

  const fetchUserData = async (token) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const userData = response.data;
      
      // Mark initialization complete
      isInitializingRef.current = false;
      
      // Atomic state update: set user and status together
      dispatch({ 
        type: AUTH_ACTIONS.AUTH_SUCCESS, 
        payload: { user: userData } 
      });
      
      // Check if user needs to change password
      if (userData.force_password_change) {
        console.log('User must change password (detected on token refresh)');
        setShowForcePasswordChange(true);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      // If token is invalid or expired, clear it
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      // Mark initialization complete
      isInitializingRef.current = false;
      // Atomic state update
      dispatch({ type: AUTH_ACTIONS.AUTH_FAILURE });
    }
  };
  
  const setError = (errorMsg) => {
    dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: { error: errorMsg } });
  };
  
  const login = async (username, password) => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
    try {
      console.log('Attempting login with:', username);
      
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        username: username,
        password
      });
      
      const { token, refreshToken, user, tokens, force_password_change } = response.data;
      
      // Handle new token format (from updated backend)
      const accessToken = tokens?.accessToken || token;
      const refresh = tokens?.refreshToken || refreshToken;
      
      if (!accessToken || !user) {
        throw new Error('Invalid response format from server');
      }
      
      console.log('Login successful:', user.username);
      
      // Save both access and refresh tokens to localStorage
      localStorage.setItem('token', accessToken);
      if (refresh) {
        localStorage.setItem('refreshToken', refresh);
      }
      
      // Check if user needs to change password
      if (force_password_change) {
        console.log('User must change password');
        // Set user first (so they're authenticated)
        dispatch({ type: AUTH_ACTIONS.AUTH_SUCCESS, payload: { user } });
        // Show force password change modal
        setShowForcePasswordChange(true);
        return true; // Login successful but will show password change modal
      }
      
      // Immediately fetch complete user data with permissions from /api/auth/me
      try {
        const userResponse = await axios.get(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        // This will include all the user's permissions directly from the database
        dispatch({ type: AUTH_ACTIONS.AUTH_SUCCESS, payload: { user: userResponse.data } });
      } catch (userError) {
        console.error('Error fetching complete user data:', userError);
        // Fall back to basic user data if /me endpoint fails
        dispatch({ type: AUTH_ACTIONS.AUTH_SUCCESS, payload: { user } });
      }
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      
      let errorMsg = 'Invalid username or password. Please try again.';
      if (error.response && error.response.data && error.response.data.error) {
        errorMsg = error.response.data.error;
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: { error: errorMsg } });
      
      return false;
    }
  };

  const oktaLogin = async (user) =>{
    dispatch({ type: AUTH_ACTIONS.AUTH_SUCCESS, payload: { user } });
  };
  
  const handlePasswordChanged = async () => {
    // Password was successfully changed
    setShowForcePasswordChange(false);
    
    // Reload the page to refresh dashboard and all components with new auth state
    window.location.reload();
  };
  
  const logout = async () => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    
    try {
      if (refreshToken) {
        // Send refresh token to logout endpoint to revoke it
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {
          refreshToken
        }, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear user data and tokens, even if API call fails
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  };
  
  // Refresh access token using refresh token
  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (!refreshToken) {
      console.log('No refresh token available');
      return null;
    }
    
    try {
      console.log('Attempting to refresh access token...');
      const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
        refreshToken
      });
      
      const { tokens } = response.data;
      
      if (tokens?.accessToken) {
        console.log('Token refresh successful');
        localStorage.setItem('token', tokens.accessToken);
        
        // Store new refresh token if provided (token rotation)
        if (tokens.refreshToken) {
          localStorage.setItem('refreshToken', tokens.refreshToken);
        }
        
        // Token refresh doesn't change user data, so we don't need to refetch it
        // This prevents unnecessary re-renders in components that depend on currentUser
        // The force_password_change flag is already set during initial login
        
        return tokens.accessToken;
      }
      
      return null;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Only clear user state if we're not in the initialization phase
      // During initialization, fetchUserData handles the state cleanup
      if (!isInitializingRef.current) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        // Use LOGOUT instead of AUTH_FAILURE to ensure clean state transition
        // This prevents infinite refresh loops and ensures consistent state
        dispatch({ type: AUTH_ACTIONS.LOGOUT });
      }
      return null;
    }
  };
  
  // Configure axios defaults and interceptors
  useEffect(() => {
    // Set default base URL
    axios.defaults.baseURL = API_BASE_URL;
    
    // Add auth headers to all requests if user is logged in
    const requestInterceptor = axios.interceptors.request.use(
      config => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
      },
      error => {
        return Promise.reject(error);
      }
    );
    
    // Add response interceptor for automatic token refresh
    const responseInterceptor = axios.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config;
        
        // Skip token refresh during initialization - let fetchUserData handle auth errors
        if (isInitializingRef.current) {
          return Promise.reject(error);
        }
        
        // If error is 401 or 403 and we haven't already retried
        if ((error.response?.status === 401 || error.response?.status === 403) && !originalRequest._retry) {
          originalRequest._retry = true;
          
          // Attempt to refresh the token
          const newToken = await refreshAccessToken();
          
          if (newToken) {
            // Update the original request with new token
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            
            // Retry the original request
            return axios(originalRequest);
          }
        }
        
        return Promise.reject(error);
      }
    );
    
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);
  
  // Check if user has a specific permission
  const hasPermission = (permission) => {
    if (!currentUser) {
      return false;
    }
    
    // Users with admin-level access have access to everything
    if (hasAdminLevelAccess(currentUser)) {
      return true;
    }
    
    // Check permissions from the backend - this is the primary source of truth
    if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
      // First check for direct string match (handles exact permission matches)
      if (currentUser.permissions.some(p => p === permission)) {
        return true;
      }
      
      // Process the permission to get resource and action
      let resource, action;
      
      // Handle various permission formats - CHECK COLON FORMAT FIRST
      if (permission.includes(':')) {
        // Modern format: 'resource:action' like 'file_upload:read'
        const parts = permission.split(':');
        resource = parts[0];
        action = parts[1];
      } else if (permission.includes('_')) {
        // Format: 'resource_action' like 'dashboard_view'
        const parts = permission.split('_');
        // The last part is the action, everything else is the resource
        action = parts.pop();
        resource = parts.join('_');
        
        // Convert view/edit to read/write
        if (action === 'view') action = 'read';
        if (action === 'edit') action = 'write';
      } else if (permission.endsWith('_view') || permission.endsWith('_edit')) {
        // Legacy format: 'resource_view' or 'resource_edit'
        action = permission.endsWith('_view') ? 'read' : 'write';
        resource = permission.replace('_view', '').replace('_edit', '');
      } else {
        // Just a resource name, default to read access check
        resource = permission;
        action = 'read';
      }
      
      // Try various formats of the resource name to handle inconsistencies
      const resourceVariations = [
        resource,                    // Original
        resource.replace(/s$/, ''),  // Remove trailing 's' (e.g. connections -> connection)
        resource + 's',              // Add trailing 's' (e.g. connection -> connections)
        resource.replace(/_/g, '-'), // Replace underscore with dash
        resource.replace(/-/g, '_')  // Replace dash with underscore
      ];
      
      return currentUser.permissions.some(p => {
        // Handle string format permissions (new format from database)
        if (typeof p === 'string') {
          // Check for colon-separated format
          if (p.includes(':')) {
            const [permResource, permAction] = p.split(':');
            
            // Check if any variation of the resource matches
            return resourceVariations.includes(permResource) && 
                   (permAction === action || permAction === '*');
          }
          
          // Direct string match for backward compatibility
          return p === permission;
        }
        
        // Handle object format permissions (check all possible field names)
        if (typeof p === 'object') {
          const permCode = p.name || p.permission_name || p.permission_code;
          if (permCode === permission) {
            return true;
          }
          
          // Also check for resource:action format matching
          if (permCode && permCode.includes(':')) {
            const [permResource, permAction] = permCode.split(':');
            return resourceVariations.includes(permResource) && 
                   (permAction === action || permAction === '*');
          }
        }
        
        return false;
      });
    }
    
    return false;
  };
  
  // Check if user has permission to access a specific feature based on resource and action
  const hasFeaturePermission = (resource, action = 'view') => {
    if (!currentUser) {
      return false;
    }
    
    // Users with admin-level access have access to everything
    if (hasAdminLevelAccess(currentUser)) {
      return true;
    }
    
    // Convert the action to read/write format used in the database
    const convertedAction = action === 'view' ? 'read' : 'write';
    
    // Try various formats of the resource name to handle inconsistencies
    const resourceVariations = [
      resource,                    // Original
      resource.replace(/s$/, ''),  // Remove trailing 's' (e.g. connections -> connection)
      resource + 's',              // Add trailing 's' (e.g. connection -> connections)
      resource.replace(/_/g, '-'), // Replace underscore with dash
      resource.replace(/-/g, '_')  // Replace dash with underscore
    ];
    
    // For specific features, also try with alternate names
    if (resource === 'file_upload') {
      resourceVariations.push('file'); 
      resourceVariations.push('files');
    }
    if (resource === 'connection') {
      resourceVariations.push('connections');
    }
    if (resource === 'quality_checks' || resource === 'quality_check') {
      resourceVariations.push('quality');
    }
    
    // Check permissions from the database
    if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
      return currentUser.permissions.some(p => {
        // For string format permissions (from database)
        if (typeof p === 'string') {
          const parts = p.split(':');
          if (parts.length !== 2) return false;
          
          const [permResource, permAction] = parts;
          
          // Check if any variation of the resource matches
          return resourceVariations.includes(permResource) && 
                 (permAction === convertedAction || permAction === 'write' || permAction === '*');
        }
        
        // For object format permissions (older format)
        if (typeof p === 'object' && p.resource && p.action) {
          const objAction = p.action === 'read' ? 'view' : p.action;
          return resourceVariations.includes(p.resource) && 
                 (objAction === action || objAction === 'write' || objAction === '*');
        }
        
        return false;
      });
    }
    
    return false;
  };
  
  // Enhanced role checking that works with different role data formats
  const hasRole = (roles) => {
    // Handle no user or no roles data
    if (!currentUser) {
      return false;
    }
    
    // Check for role_id (numerical) for legacy support
    // role_id: 1 = Admin, 2 = Creator, 3 = Executor 
    if (typeof currentUser.role_id === 'number') {
      const roleIdMap = {
        1: 'Admin',
        2: 'Creator',
        3: 'Executor'
      };
      const roleName = roleIdMap[currentUser.role_id];
      
      // Convert input roles to array if string
      const rolesToCheck = typeof roles === 'string' ? [roles] : roles;
      
      if (roleName && rolesToCheck.includes(roleName)) {
        return true;
      }
    }
    
    // Handle missing roles array
    if (!currentUser.roles) {
      return false;
    }
    
    // Handle string role (from direct API)
    if (typeof currentUser.roles === 'string') {
      return roles === currentUser.roles || 
        (Array.isArray(roles) && roles.includes(currentUser.roles));
    }
    
    // Handle array of roles (normal case)
    if (Array.isArray(currentUser.roles)) {
      if (typeof roles === 'string') {
        return currentUser.roles.includes(roles);
      }
      
      return roles.some(role => currentUser.roles.includes(role));
    }
    
    // Default to false for any other case
    return false;
  };
  
  // Check if user has write permission for a specific feature
  const hasWritePermission = (resource) => {
    if (!currentUser) {
      return false;
    }
    
    // Admin role has access to everything
    if (hasRole('Admin')) {
      return true;
    }
    
    // Check permissions from the backend - this is the primary source of truth
    if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
      // Try various formats of the resource name to handle inconsistencies
      const resourceVariations = [
        resource,                    // Original
        resource.replace(/s$/, ''),  // Remove trailing 's' (e.g. connections -> connection)
        resource + 's',              // Add trailing 's' (e.g. connection -> connections)
        resource.replace(/_/g, '-'), // Replace underscore with dash
        resource.replace(/-/g, '_')  // Replace dash with underscore
      ];
      
      return currentUser.permissions.some(p => {
        // Only check string format permissions from the database
        if (typeof p === 'string') {
          // Split into resource and action parts
          const parts = p.split(':');
          if (parts.length !== 2) return false;
          
          const [permResource, permAction] = parts;
          
          // Check if any variation of the resource matches
          // Write permission means any of: write, create, update, delete, edit, or *
          return resourceVariations.includes(permResource) && 
                 (permAction === 'write' || permAction === 'create' || permAction === 'update' || 
                  permAction === 'delete' || permAction === 'edit' || permAction === '*');
        }
        
        // For object format permissions (older format)
        if (typeof p === 'object' && p.resource && p.action) {
          return resourceVariations.includes(p.resource) && 
                 (p.action === 'write' || p.action === 'create' || p.action === 'update' || 
                  p.action === 'delete' || p.action === 'edit' || p.action === '*');
        }
        
        return false;
      });
    }
    
    return false;
  };

  // Check if user has execute permission for a specific feature
  const hasExecutePermission = (resource) => {
    if (!currentUser) {
      return false;
    }
    
    // Admin role has access to everything
    if (hasRole('Admin')) {
      return true;
    }
    
    // Check permissions from the backend - this is the primary source of truth
    if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
      // Try various formats of the resource name to handle inconsistencies
      const resourceVariations = [
        resource,                    // Original
        resource.replace(/s$/, ''),  // Remove trailing 's' (e.g. connections -> connection)
        resource + 's',              // Add trailing 's' (e.g. connection -> connections)
        resource.replace(/_/g, '-'), // Replace underscore with dash
        resource.replace(/-/g, '_')  // Replace dash with underscore
      ];
      
      return currentUser.permissions.some(p => {
        // Only check string format permissions from the database
        if (typeof p === 'string') {
          // Split into resource and action parts
          const parts = p.split(':');
          if (parts.length !== 2) return false;
          
          const [permResource, permAction] = parts;
          
          // Check if any variation of the resource matches and action is 'execute'
          return resourceVariations.includes(permResource) && 
                 (permAction === 'execute' || permAction === '*');
        }
        
        // For object format permissions (older format)
        if (typeof p === 'object' && p.resource && p.action) {
          return resourceVariations.includes(p.resource) && 
                 (p.action === 'execute' || p.action === '*');
        }
        
        return false;
      });
    }
    
    return false;
  };

  // Check if user has permission to access data tagged with a specific governance tag
  const hasTagPermission = (tagType, action = 'read') => {
    if (!currentUser) {
      return false;
    }
    
    // Users with admin-level access have access to all tagged data
    if (hasAdminLevelAccess(currentUser)) {
      return true;
    }
    
    // Check for tag-based permissions in format "tag:tagType:action"
    // For example: "tag:pii:read", "tag:confidential:edit", "tag:financial:*"
    if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
      return currentUser.permissions.some(p => {
        if (typeof p === 'string') {
          const parts = p.split(':');
          
          // Must be in format "tag:tagType:action"
          if (parts.length !== 3 || parts[0] !== 'tag') {
            return false;
          }
          
          const [, permTagType, permAction] = parts;
          
          // Case-insensitive tag type matching
          const tagTypeMatch = permTagType.toLowerCase() === tagType.toLowerCase();
          
          // Action matching: exact match, wildcard (*), or edit includes read
          const actionMatch = permAction === action || 
                             permAction === '*' || 
                             (action === 'read' && permAction === 'edit');
          
          return tagTypeMatch && actionMatch;
        }
        
        return false;
      });
    }
    
    return false;
  };

  const value = {
    currentUser,
    login,
    logout,
    loading,
    error,
    authStatus,
    hasPermission,
    hasFeaturePermission,
    hasRole,
    hasWritePermission,
    hasExecutePermission,
    hasTagPermission,
    oktaLogin,
    // setCurrentUser,
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
      {showForcePasswordChange && (
        <ForcePasswordChange onPasswordChanged={handlePasswordChanged} />
      )}
    </AuthContext.Provider>
  );
};

// Export the provider
export default AuthProvider;