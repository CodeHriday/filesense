/**
 * Application Configuration
 * 
 * This file contains configuration settings for the application.
 * It includes API URLs, feature flags, and other settings.
 */

// API URLs
export const API_BASE_URL = (() => {
  // In production, use the environment variable or default to relative path
  if (process.env.NODE_ENV === 'production') {
    return process.env.API_BASE_URL || '';
  }
  
  // In development, use the local development server
  return 'http://localhost:3000';
})();

// Application theme settings
export const THEME = {
  primaryColor: '#3b82f6', // Blue
  secondaryColor: '#6366f1', // Indigo
  accentColor: '#8b5cf6', // Violet
  successColor: '#10b981', // Green
  warningColor: '#f59e0b', // Yellow
  errorColor: '#ef4444', // Red
  infoColor: '#3b82f6', // Blue
  
  // Blumetra brand colors (based on previous implementation)
  brand: {
    primary: '#0c2e4e',
    secondary: '#256eb5',
    accent: '#16c6cc',
  },
  
  // Font settings
  font: {
    family: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
    },
  },
  
  // Animation settings
  animation: {
    baseDuration: '300ms',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

// Feature flags
export const FEATURES = {
  enableDarkMode: true,
  enableAccessibility: true,
  enableAnalytics: process.env.NODE_ENV === 'production',
  enableNotifications: true,
  enableExperimentalFeatures: process.env.NODE_ENV !== 'production',
};

// Pagination settings
export const PAGINATION = {
  defaultPageSize: 10,
  pageSizeOptions: [5, 10, 20, 50, 100],
};

// Cache settings for React Query
export const CACHE = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 15 * 60 * 1000, // 15 minutes
};

// Navigation config
export const NAVIGATION = {
  sidebar: [
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '/dashboard',
      icon: 'Dashboard',
      permission: 'dashboard:read',
    },
    {
      id: 'files',
      label: 'Files',
      path: '/files',
      icon: 'Files',
      permission: 'file:view',
    },
    {
      id: 'processes',
      label: 'Processes',
      path: '/processes',
      icon: 'Processes',
      permission: 'processes:read',
    },
    {
      id: 'transformations',
      label: 'Transformations',
      path: '/transformations',
      icon: 'Transform',
      permission: 'mappings:read',
    },
    {
      id: 'settings',
      label: 'Settings',
      path: '/settings',
      icon: 'Settings',
      permission: 'settings:read',
    },
  ],
};

export default {
  API_BASE_URL,
  THEME,
  FEATURES,
  PAGINATION,
  CACHE,
  NAVIGATION,
};