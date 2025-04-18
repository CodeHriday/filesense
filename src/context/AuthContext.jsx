import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';

// Create context
const AuthContext = createContext(null);

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
      
      // Immediately fetch complete user data with permissions from /api/auth/me
      try {
        const userResponse = await axios.get(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        // This will include all the user's permissions directly from the database
        setCurrentUser(userResponse.data);
      } catch (userError) {
        console.error('Error fetching complete user data:', userError);
        // Fall back to basic user data if /me endpoint fails
        setCurrentUser(user);
      }
      
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
    
    // Check permissions from the backend - this is the primary source of truth
    if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
      // Process the permission to get resource and action
      let resource, action;
      
      // Handle various permission formats
      if (permission.includes('_')) {
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
          const [permResource, permAction] = p.split(':');
          
          // Check if any variation of the resource matches
          return resourceVariations.includes(permResource) && 
                 (permAction === action || permAction === '*');
        }
        
        // Handle object format permissions (older format)
        if (typeof p === 'object' && p.name === permission) {
          return true;
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
    
    // Directly use our enhanced hasRole function
    const isAdmin = hasRole('Admin');
    const isCreator = hasRole('Creator');
    
    // Admin role has access to everything
    if (isAdmin) {
      return true;
    }
    
    // Creator role has access to most features except user/role management
    if (isCreator && resource !== 'user_management' && resource !== 'role_management') {
      // These resources should always be available to Creators
      const creatorResources = [
        'connections', 'connection', 'mappings', 'mapping', 
        'file_upload', 'files', 'file', 'quality_checks', 'quality_check',
        'lineage', 'scheduler', 'alerts', 'alert',
        // Add additional resource variations
        'file_profile', 'quality', 'monitor', 'dashboard',
        'badges', 'badge', 'insights', 'insight',
        'recommendations', 'recommendation',
        'stories', 'story'
      ];
      
      if (creatorResources.includes(resource)) {
        return true;
      }
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
          
          // Check if any variation of the resource matches and action is 'write'
          return resourceVariations.includes(permResource) && 
                 (permAction === 'write' || permAction === '*');
        }
        
        // For object format permissions (older format)
        if (typeof p === 'object' && p.resource && p.action) {
          return resourceVariations.includes(p.resource) && 
                 (p.action === 'write' || p.action === '*');
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
};

// Export the provider
export default AuthProvider;