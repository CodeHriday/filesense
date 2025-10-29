import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../config';
import axios from 'axios';
import PasswordInput from '../components/PasswordInput';
import { isVendorUser } from '../utils/userHelpers';
import '../styles/Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [loginFailed, setLoginFailed] = useState(false);
  const { login, currentUser, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Redirect if user is already logged in
  useEffect(() => {
    if (currentUser) {
      // Vendor users should go to drop page, others to their intended destination or dashboard
      const defaultPath = isVendorUser(currentUser) ? '/drop' : '/';
      const from = location.state?.from?.pathname || defaultPath;
      navigate(from, { replace: true });
    }
  }, [currentUser, navigate, location]);
  
  // Update error message from auth context
  useEffect(() => {
    if (error) {
      setErrorMessage(error);
    }
  }, [error]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!username || !password) {
      setErrorMessage('Username and password are required');
      setLoginFailed(true);
      return;
    }
    
    setIsLoading(true);
    setErrorMessage('');
    setLoginFailed(false);
    
    try {
      const success = await login(username, password);
      
      if (success) {
        // Redirect happens automatically in the useEffect above
      } else {
        setLoginFailed(true);
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrorMessage('Failed to login. Please check your credentials.');
      setLoginFailed(true);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleForgotPassword = () => {
    setResetUsername(username); // Pre-fill with the entered username
    setShowResetModal(true);
    setResetMessage('');
    setResetError('');
  };
  
  const handleResetPasswordRequest = async (e) => {
    e.preventDefault();
    
    if (!resetUsername) {
      setResetError('Please enter your username or email');
      return;
    }
    
    setResetLoading(true);
    setResetError('');
    setResetMessage('');
    
    try {
      const response = await axios.post('/api/auth/request-password-reset', {
        username: resetUsername
      });
      
      setResetMessage(response.data.message);
      // Clear form and close modal after 3 seconds
      setTimeout(() => {
        setShowResetModal(false);
        setResetUsername('');
        setResetMessage('');
      }, 3000);
    } catch (error) {
      console.error('Password reset request error:', error);
      setResetError(error.response?.data?.error || 'Failed to submit password reset request');
    } finally {
      setResetLoading(false);
    }
  };
  
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img 
            src="/images/blumetra-logo.png" 
            alt="Blumetra" 
            className="login-logo" 
            onError={(e) => {
              e.target.onerror = null;
              e.target.style.display = 'none';
            }}
          />
          <h2>Data File Observatory</h2>
          <h3>Sign In</h3>
        </div>
        
        {errorMessage && (
          <div className="login-error" role="alert">
            {errorMessage}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              placeholder="Enter your username"
              aria-label="Username"
              autoComplete="username"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              placeholder="Enter your password"
            />
          </div>
          
          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
          
          {loginFailed && (
            <div className="forgot-password-link">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-link"
              >
                Forgot Password?
              </button>
            </div>
          )}
        </form>
      </div>
      
      {/* Password Reset Request Modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Request Password Reset</h3>
              <button
                className="modal-close"
                onClick={() => setShowResetModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <p className="modal-description">
                Enter your username or email address. An administrator will review your request and reset your password.
              </p>
              
              {resetError && (
                <div className="alert alert-error">
                  {resetError}
                </div>
              )}
              
              {resetMessage && (
                <div className="alert alert-success">
                  {resetMessage}
                </div>
              )}
              
              <form onSubmit={handleResetPasswordRequest}>
                <div className="form-group">
                  <label htmlFor="resetUsername">Username or Email</label>
                  <input
                    type="text"
                    id="resetUsername"
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                    disabled={resetLoading}
                    placeholder="Enter your username or email"
                    autoFocus
                  />
                </div>
                
                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="btn-secondary"
                    disabled={resetLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={resetLoading}
                  >
                    {resetLoading ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;