// API configuration
// In development, use localhost
// In Replit, use the same origin but with port 3000 for the API
export const API_BASE_URL = (() => {
  const hostname = window.location.hostname;
  
  // For localhost development
  if (hostname === 'localhost') {
    return 'http://localhost:3000';
  }
  
  // For Replit environment, use relative path
  // Vite will proxy /api calls to the backend server
  return '';
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

// Export other global configurations here