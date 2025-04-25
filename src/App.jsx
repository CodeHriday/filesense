/**
 * Main App Component
 * 
 * This is the root component of the application that sets up routing
 * and global layout.
 */
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppProvider from './AppProvider';
import { useAuth } from './hooks/useAuth';
import { useUI } from './hooks/useUI';

// Import layouts
import MainLayout from './components/layouts/MainLayout';
import AuthLayout from './components/layouts/AuthLayout';

// Import pages
// Auth pages
import LoginPage from './pages/auth/Login';
import RegisterPage from './pages/auth/Register';
import ForgotPasswordPage from './pages/auth/ForgotPassword';
import ResetPasswordPage from './pages/auth/ResetPassword';

// App pages
import DashboardPage from './pages/Dashboard';
import FilesPage from './pages/Files';
import NotFoundPage from './pages/NotFound';

// Protected route component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const { loading } = useUI();
  
  // Use useEffect to handle loading state changes
  // This prevents setting state during render
  React.useEffect(() => {
    if (isLoading) {
      loading.setGlobalLoading(true);
    } else {
      loading.setGlobalLoading(false);
    }
  }, [isLoading, loading]);
  
  // Show spinner while checking authentication
  if (isLoading) {
    // Simple loading indicator until Spinner component is properly integrated
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" 
             role="status" aria-label="loading">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }
  
  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// App Routes
const AppRoutes = () => {
  return (
    <Routes>
      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>
      
      {/* Protected app routes */}
      <Route element={
        <ProtectedRoute>
          <MainLayout />
        </ProtectedRoute>
      }>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/files" element={<FilesPage />} />
        {/* More routes will be added as components are created */}
      </Route>
      
      {/* Catch-all for 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

// Main App Component
const App = () => {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
};

export default App;