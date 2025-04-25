/**
 * Frontend configuration module
 * 
 * This module centralizes configuration values for the frontend application.
 */

// API configuration
// In development, use localhost
// In Replit, use the same origin but with port 3000 for the API
export const API_BASE_URL = (() => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // For localhost development
  if (hostname === 'localhost') {
    return 'http://localhost:3000/api';
  }
  
  // For Replit environment, use current origin with port 3000
  return `${protocol}//${hostname}:3000/api`;
})();

// Blumetra theme colors
export const THEME = {
  colors: {
    primary: '#0079C1',    // Blumetra blue
    secondary: '#333333',  // Dark gray
    accent: '#FF5722',     // Orange accent
    background: '#F4F7F9', // Light gray background
    text: '#333333',       // Text color
    lightText: '#666666',  // Secondary text
    white: '#FFFFFF'       // White
  },
  fonts: {
    primary: "'Poppins', sans-serif",
    secondary: "'Open Sans', sans-serif",
  }
};

// App configuration
export const APP_CONFIG = {
  appName: 'Data File Observatory',
  appVersion: '1.0.0',
  companyName: 'Blumetra',
  maxFileSize: 100 * 1024 * 1024, // 100MB default
  allowedFileTypes: ['.csv', '.json', '.xlsx', '.parquet'],
  pagination: {
    defaultPageSize: 10,
    pageSizeOptions: [10, 20, 50, 100]
  },
  dateFormat: 'MMM DD, YYYY',
  timeFormat: 'h:mm A',
  dateTimeFormat: 'MMM DD, YYYY h:mm A'
};

// Feature flags for enabling/disabling features
export const FEATURE_FLAGS = {
  enableTransformations: true,
  enableLineage: true,
  enableQualityChecks: true,
  enableAlerts: true,
  enableInsights: true,
  enableBadges: true,
  enableProcessManagement: true,
  enableScheduling: true,
  enableCloudStorage: true
};

// URLs for external resources
export const EXTERNAL_URLS = {
  documentation: 'https://docs.blumetra.com',
  support: 'https://support.blumetra.com',
  termsOfService: 'https://blumetra.com/terms',
  privacyPolicy: 'https://blumetra.com/privacy'
};