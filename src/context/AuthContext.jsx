import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

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
      const response = await axios.get('/api/auth/me', {
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
      const response = await axios.post('http://localhost:3000/api/auth/login', {
        username,
        password
      });
      
      const { token, user } = response.data;
      
      // Save token to localStorage
      localStorage.setItem('token', token);
      
      // Set current user
      setCurrentUser(user);
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      
      if (error.response && error.response.data && error.response.data.error) {
        setError(error.response.data.error);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      
      return false;
    }
  };
  
  const logout = async () => {
    const token = localStorage.getItem('token');
    
    try {
      if (token) {
        await axios.post('/api/auth/logout', {}, {
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
  
  // Add auth headers to all requests if user is logged in
  useEffect(() => {
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
    if (!currentUser || !currentUser.permissions) {
      return false;
    }
    
    return currentUser.permissions.some(p => p.name === permission);
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
  
  const value = {
    currentUser,
    login,
    logout,
    loading,
    error,
    hasPermission,
    hasRole
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}