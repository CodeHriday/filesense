import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../config';
import '../styles/Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [oktaAvailable, setOktaAvailable] = useState(false);
  const [showOktaOption, setShowOktaOption] = useState(false);
  const { login, currentUser, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Redirect if user is already logged in
  useEffect(() => {
    if (currentUser) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [currentUser, navigate, location]);
  
  // Check if Okta SSO is available
  useEffect(() => {
    fetch('/api/auth/okta/status')
      .then(res => res.json())
      .then(data => {
        if (data.configured && data.available) {
          setOktaAvailable(true);
          setShowOktaOption(true);
        }
      })
      .catch(err => {
        console.log('Okta not configured, using local auth only');
      });
  }, []);
  
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
      return;
    }
    
    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const success = await login(username, password);
      
      if (success) {
        // Redirect happens automatically in the useEffect above
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrorMessage('Failed to login. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleOktaLogin = () => {
    setIsLoading(true);
    setErrorMessage('');
    window.location.href = '/api/auth/okta/login';
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
        
        {showOktaOption && (
          <>
            <button 
              type="button"
              className="okta-login-button"
              onClick={handleOktaLogin}
              disabled={isLoading}
            >
              <svg viewBox="0 0 24 24" className="okta-icon" width="20" height="20">
                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
              Sign in with Enterprise SSO
            </button>
            
            <div className="login-divider">
              <span>or sign in with username</span>
            </div>
          </>
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
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              placeholder="Enter your password"
              aria-label="Password"
              autoComplete="current-password"
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
        </form>
        
        <div className="login-help">
          <p>Default access: Username <strong>Admin</strong> / Password <strong>admin</strong></p>
        </div>
      </div>
    </div>
  );
};

export default Login;