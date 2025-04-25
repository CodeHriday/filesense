/**
 * Authentication Hook
 * 
 * Custom hook for managing authentication, user state, and permissions.
 */
import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  loginStart, 
  loginSuccess, 
  loginFailure, 
  logout, 
  refreshTokenStart,
  refreshTokenSuccess,
  refreshTokenFailure,
  initializeAuth,
  selectIsAuthenticated,
  selectUser,
  selectToken,
  selectRefreshToken,
  selectRoles,
  selectPermissions,
  selectHasRole,
  selectHasPermission,
  selectIsLoading,
  selectAuthError
} from '../lib/redux/slices/authSlice';
import { QueryKeys } from '../lib/react-query';
import { API_BASE_URL } from '../config';

const AUTH_STORAGE_KEY = 'dfo_auth';

/**
 * Main authentication hook providing authentication state and methods
 */
export const useAuth = () => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);
  const token = useSelector(selectToken);
  const refreshToken = useSelector(selectRefreshToken);
  const isLoading = useSelector(selectIsLoading);
  const error = useSelector(selectAuthError);
  
  // Load authentication state from localStorage on mount
  useEffect(() => {
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    
    if (savedAuth) {
      try {
        const authData = JSON.parse(savedAuth);
        
        // Check if token appears valid (not expired)
        if (authData.token) {
          dispatch(initializeAuth(authData));
          
          // Fetch current user to validate token
          queryClient.prefetchQuery(QueryKeys.auth.user, fetchCurrentUser);
        }
      } catch (err) {
        console.error('Failed to parse saved authentication data:', err);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  }, [dispatch, queryClient]);
  
  // Save auth state to localStorage when it changes
  useEffect(() => {
    if (isAuthenticated && token && user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        user,
        token,
        refreshToken,
        roles: user.roles,
        permissions: user.permissions,
      }));
    } else if (!isAuthenticated) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [isAuthenticated, token, refreshToken, user]);
  
  // API calls
  const loginApi = async (credentials) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Login failed');
    }
    
    return await response.json();
  };
  
  const fetchCurrentUser = async () => {
    if (!token) return null;
    
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired - try refresh
        await refreshTokenMutation.mutateAsync();
        throw new Error('Session expired. Please try again.');
      }
      
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch user data');
    }
    
    return await response.json();
  };
  
  const refreshTokenApi = async () => {
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to refresh token');
    }
    
    return await response.json();
  };
  
  const logoutApi = async () => {
    if (!token) return;
    
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (err) {
      console.error('Logout API call failed:', err);
      // Continue with local logout even if API call fails
    }
  };
  
  // Mutations
  const loginMutation = useMutation({
    mutationFn: loginApi,
    onMutate: () => {
      dispatch(loginStart());
    },
    onSuccess: (data) => {
      const { user, token, refreshToken } = data;
      dispatch(loginSuccess({
        user,
        token,
        refreshToken,
        roles: user.roles,
        permissions: user.permissions,
      }));
      
      // Invalidate and refetch user data
      queryClient.invalidateQueries(QueryKeys.auth.user);
    },
    onError: (error) => {
      dispatch(loginFailure(error.message));
    },
  });
  
  const refreshTokenMutation = useMutation({
    mutationFn: refreshTokenApi,
    onMutate: () => {
      dispatch(refreshTokenStart());
    },
    onSuccess: (data) => {
      const { token, refreshToken } = data;
      dispatch(refreshTokenSuccess({ token, refreshToken }));
      
      // Invalidate and refetch user data
      queryClient.invalidateQueries(QueryKeys.auth.user);
    },
    onError: (error) => {
      dispatch(refreshTokenFailure(error.message));
      handleLogout();
    },
  });
  
  const logoutMutation = useMutation({
    mutationFn: logoutApi,
    onSuccess: () => {
      dispatch(logout());
      queryClient.clear(); // Clear all query cache on logout
    },
    onError: () => {
      // Even if the API call fails, we should still log out locally
      dispatch(logout());
      queryClient.clear();
    },
  });
  
  // Current user query
  const userQuery = useQuery({
    queryKey: QueryKeys.auth.user,
    queryFn: fetchCurrentUser,
    enabled: !!isAuthenticated && !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    onError: (error) => {
      console.error('User query failed:', error);
      // If we can't fetch the user, the token might be invalid
      if (error.message.includes('expired')) {
        handleLogout();
      }
    },
  });
  
  // Login handler
  const handleLogin = useCallback((credentials) => {
    return loginMutation.mutateAsync(credentials);
  }, [loginMutation]);
  
  // Logout handler
  const handleLogout = useCallback(() => {
    return logoutMutation.mutateAsync();
  }, [logoutMutation]);
  
  // Refresh token handler
  const handleRefreshToken = useCallback(() => {
    return refreshTokenMutation.mutateAsync();
  }, [refreshTokenMutation]);
  
  return {
    // State
    isAuthenticated,
    user,
    token,
    isLoading: isLoading || userQuery.isLoading,
    error,
    
    // Actions
    login: handleLogin,
    logout: handleLogout,
    refreshToken: handleRefreshToken,
    
    // User query state
    userQuery,
  };
};

/**
 * Hook for checking permissions
 */
export const usePermissions = () => {
  const roles = useSelector(selectRoles);
  const permissions = useSelector(selectPermissions);
  
  // Check if user has specific role
  const hasRole = useCallback((roleName) => {
    return roles?.includes(roleName) || false;
  }, [roles]);
  
  // Check if user has specific permission
  const hasPermission = useCallback((permissionName) => {
    if (!permissions || permissions.length === 0) {
      return false;
    }
    
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
  }, [permissions]);
  
  // For complex permission checks
  const checkPermission = useCallback((checker) => {
    if (typeof checker === 'string') {
      return hasPermission(checker);
    }
    
    if (typeof checker === 'function') {
      return checker(permissions);
    }
    
    return false;
  }, [hasPermission, permissions]);
  
  return {
    roles,
    permissions,
    hasRole,
    hasPermission,
    checkPermission,
    
    // Common role checks
    isAdmin: hasRole('Admin'),
    isManager: hasRole('Manager'),
    isEditor: hasRole('Editor'),
    isViewer: hasRole('Viewer'),
  };
};

export default useAuth;