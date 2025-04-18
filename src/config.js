// API configuration
export const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : `${window.location.protocol}//${window.location.hostname}:3000`;

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