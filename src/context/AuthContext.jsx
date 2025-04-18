import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Check if there's a token in localStorage on initial load
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (token) {
      fetchUserData(token);
    } else {
      setLoading(false);
    }
  }, []);
  
  const fetchUserData = async (token) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      setCurrentUser(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching user data:', error);
      // If token is invalid or expired, clear it
      localStorage.removeItem('token');
      setCurrentUser(null);
      setLoading(false);
    }
  };
  
  const login = async (username, password) => {
    setError('');
    try {
      // Force username to be case-insensitive (lowercase)
      const usernameNormalized = username.toLowerCase();
      
      console.log('Attempting login with:', usernameNormalized);
      
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        username: usernameNormalized,
        password
      });
      
      const { token, user } = response.data;
      
      if (!token || !user) {
        throw new Error('Invalid response format from server');
      }
      
      console.log('Login successful:', user.username);
      
      // Save token to localStorage
      localStorage.setItem('token', token);
      
      // Set current user
      setCurrentUser(user);
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      
      if (error.response && error.response.data && error.response.data.error) {
        setError(error.response.data.error);
      } else if (error.message) {
        setError(error.message);
      } else {
        setError('Invalid username or password. Please try again.');
      }
      
      return false;
    }
  };
  
  const logout = async () => {
    const token = localStorage.getItem('token');
    
    try {
      if (token) {
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear user data and token, even if API call fails
      localStorage.removeItem('token');
      setCurrentUser(null);
    }
  };
  
  // Configure axios defaults and interceptors
  useEffect(() => {
    // Set default base URL
    axios.defaults.baseURL = API_BASE_URL;
    
    // Add auth headers to all requests if user is logged in
    const interceptor = axios.interceptors.request.use(
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
    
    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, []);
  
  // Check if user has a specific permission
  const hasPermission = (permission) => {
    if (!currentUser) {
      return false;
    }
    
    // Admin role has access to everything
    if (currentUser.roles && currentUser.roles.includes('Admin')) {
      return true;
    }
    
    // Creator role has access to all basic features
    if (currentUser.roles && currentUser.roles.includes('Creator')) {
      // Granting all basic permissions to Creator role
      const creatorPermissions = [
        'dashboard_view', 'dashboard_edit', 'file_upload', 'file_upload_write',
        'file_profile', 'file_profile_write', 'quality_checks', 'quality_checks_write', 
        'alerts', 'alerts_write', 'connections', 'connections_write', 
        'mappings', 'mappings_write', 'lineage', 'lineage_write', 
        'monitor', 'monitor_write', 'scheduler', 'scheduler_write', 
        'badges', 'badges_write', 'insights', 'insights_write', 
        'recommendations', 'recommendations_write', 'stories', 'stories_write', 
        'file_view', 'insight_view', 'lineage_view', 'alert_view',
        'badges_read', 'insights_read', 'recommendations_read', 'stories_read'
      ];
      
      if (creatorPermissions.includes(permission)) {
        return true;
      }
    }
    
    // Executor role has limited access to viewing features only
    if (currentUser.roles && currentUser.roles.includes('Executor')) {
      // Granting limited viewing permissions to Executor role
      const executorPermissions = [
        'dashboard_view', 'file_profile', 'quality_checks_read', 'mappings_read', 
        'lineage_read', 'monitor_read', 'scheduler_read', 'badges_read', 
        'insights_read', 'recommendations_read', 'stories_read',
        'file_view', 'lineage_view', 'quality_checks'
      ];
      
      if (executorPermissions.includes(permission)) {
        return true;
      }
    }
    
    // Check permissions from the backend
    if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
      // Check permissions in both formats: direct match and resource:action format
      return currentUser.permissions.some(p => {
        // Direct match with name property
        if (p.name === permission) {
          return true;
        }
        
        // Match with resource:action format (for string arrays from backend)
        // Convert view/edit to read/write
        if (typeof p === 'string') {
          // For permissions like 'badges_read', convert to 'badges:read'
          if (permission.includes('_')) {
            const [resource, action] = permission.split('_');
            const convertedAction = action === 'view' ? 'read' : (action === 'edit' ? 'write' : action);
            return p === `${resource}:${convertedAction}`;
          }
          
          // For legacy permission formats
          const action = permission.endsWith('_view') ? 'read' : 'write';
          const resource = permission.replace('_view', '').replace('_edit', '');
          return p === `${resource}:${action}`;
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
    
    // Admin role has access to everything
    if (currentUser.roles && currentUser.roles.includes('Admin')) {
      return true;
    }
    
    // Creator role has access to all basic features
    if (currentUser.roles && currentUser.roles.includes('Creator')) {
      const creatorResources = [
        'dashboard', 'file', 'profile', 'quality', 'alert',
        'connection', 'mapping', 'lineage', 'monitor', 'scheduler', 'badge',
        'insight', 'recommendation', 'story'
      ];
      
      if (creatorResources.includes(resource)) {
        return true;
      }
    }
    
    // Executor role has limited read-only access to basic features
    if (currentUser.roles && currentUser.roles.includes('Executor')) {
      const executorResources = [
        'dashboard', 'file', 'profile', 'quality', 'lineage', 'monitor', 
        'scheduler', 'badge', 'insight', 'recommendation', 'story'
      ];
      
      if (executorResources.includes(resource) && action === 'view') {
        return true;
      }
    }
    
    // Check permissions from the backend
    if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
      return currentUser.permissions.some(p => {
        // For object format permissions (older format)
        if (typeof p === 'object' && p.resource === resource && 
            (p.action === action || p.action === '*')) {
          return true;
        }
        
        // For string format permissions (new format)
        if (typeof p === 'string') {
          const [permResource, permAction] = p.split(':');
          const convertedAction = action === 'view' ? 'read' : 'write';
          return permResource === resource && 
                 (permAction === convertedAction || permAction === '*');
        }
        
        return false;
      });
    }
    
    return false;
  };
  
  // Check if user has any of the roles
  const hasRole = (roles) => {
    if (!currentUser || !currentUser.roles) {
      return false;
    }
    
    if (typeof roles === 'string') {
      return currentUser.roles.includes(roles);
    }
    
    return roles.some(role => currentUser.roles.includes(role));
  };
  
  // Check if user has write permission for a specific feature
  const hasWritePermission = (resource) => {
    if (!currentUser) {
      return false;
    }
    
    // Admin role has access to everything
    if (currentUser.roles && currentUser.roles.includes('Admin')) {
      return true;
    }
    
    // For Creator role, check specific permissions
    if (currentUser.roles && currentUser.roles.includes('Creator')) {
      const creatorWriteResources = [
        'dashboard', 'file', 'profile', 'quality', 'alert',
        'connection', 'mapping', 'lineage', 'monitor', 'scheduler', 'badge',
        'insight', 'recommendation', 'story'
      ];
      
      if (creatorWriteResources.includes(resource)) {
        return true;
      }
    }
    
    // Check permissions from the backend
    if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
      return currentUser.permissions.some(p => {
        // For object format permissions (older format)
        if (typeof p === 'object' && p.resource === resource && p.action === 'write') {
          return true;
        }
        
        // For string format permissions (new format)
        if (typeof p === 'string') {
          const [permResource, permAction] = p.split(':');
          return permResource === resource && permAction === 'write';
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
    hasPermission,
    hasFeaturePermission,
    hasRole,
    hasWritePermission
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}