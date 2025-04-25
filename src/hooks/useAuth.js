/**
 * Authentication-related React Query hooks
 * 
 * This file contains React Query hooks for authentication operations
 * including login, logout, and user data management.
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { queryClient, QueryKeys } from '../lib/react-query';
import { 
  fetchCurrentUser, 
  loginUser, 
  logoutUser,
  selectUser,
  selectAuthLoading,
  selectIsAuthenticated,
  selectAuthError,
  selectHasRole,
  selectHasPermission,
  selectUserRoles,
  selectUserPermissions
} from '../lib/redux/slices/authSlice';
import { API_BASE_URL } from '../config';

const API_URL = `${API_BASE_URL}/api`;

/**
 * Primary auth hook that combines Redux and React Query
 */
export const useAuth = () => {
  const dispatch = useDispatch();
  
  // Select data from Redux store
  const user = useSelector(selectUser);
  const loading = useSelector(selectAuthLoading);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const error = useSelector(selectAuthError);
  const roles = useSelector(selectUserRoles);
  const permissions = useSelector(selectUserPermissions);
  
  // Login mutation using RTK
  const login = async (username, password) => {
    const resultAction = await dispatch(loginUser({ username, password }));
    
    if (loginUser.fulfilled.match(resultAction)) {
      // Success, returned the user
      return resultAction.payload;
    } else {
      // Error, throw to be caught by the component
      throw new Error(resultAction.payload || 'Failed to login');
    }
  };
  
  // Logout mutation using RTK
  const logout = async () => {
    const resultAction = await dispatch(logoutUser());
    
    if (logoutUser.fulfilled.match(resultAction)) {
      // Clear React Query cache on logout
      queryClient.clear();
      return true;
    } else {
      throw new Error(resultAction.payload || 'Failed to logout');
    }
  };
  
  // Initialize Auth - check for token and load user data
  const initAuth = async () => {
    const token = localStorage.getItem('token');
    
    if (token && !user) {
      const resultAction = await dispatch(fetchCurrentUser());
      return fetchCurrentUser.fulfilled.match(resultAction);
    }
    
    return !!user;
  };
  
  // Role and permission checks
  const hasRole = (role) => {
    return useSelector(selectHasRole(role));
  };
  
  const hasPermission = (permission) => {
    return useSelector(selectHasPermission(permission));
  };
  
  return {
    user,
    loading,
    isAuthenticated,
    error,
    roles,
    permissions,
    login,
    logout,
    initAuth,
    hasRole,
    hasPermission
  };
};

/**
 * Hook for refreshing authentication token
 */
export const useRefreshToken = () => {
  return useMutation({
    mutationFn: async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (!refreshToken) {
        throw new Error('No refresh token found');
      }
      
      const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
      
      const { token, user } = response.data;
      
      if (!token) {
        throw new Error('No token returned from refresh request');
      }
      
      // Update tokens in localStorage
      localStorage.setItem('token', token);
      if (response.data.refreshToken) {
        localStorage.setItem('refreshToken', response.data.refreshToken);
      }
      
      return user;
    },
    onSuccess: (data) => {
      // Update user data in Redux
      queryClient.invalidateQueries({ queryKey: QueryKeys.auth.currentUser });
    }
  });
};

/**
 * Hook for checking if current user has permission for a feature
 */
export const useHasPermission = (permission) => {
  return useSelector(selectHasPermission(permission));
};

/**
 * Hook for checking if current user has a specific role
 */
export const useHasRole = (role) => {
  return useSelector(selectHasRole(role));
};