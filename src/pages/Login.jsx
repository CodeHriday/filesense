import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../config';
import axios from 'axios';
import PasswordInput from '../components/PasswordInput';
import { isVendorUser } from '../utils/userHelpers';
import PasswordChangeRequired from './PasswordChangeRequired';
import '../styles/Login.css';
import { getSecret } from '../config/secrets';

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
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [passwordChangeUserId, setPasswordChangeUserId] = useState(null);
  const [passwordChangeUsername, setPasswordChangeUsername] = useState('');
  const [passwordChangeToken, setPasswordChangeToken] = useState('');
  const { login, currentUser, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [activeFeature, setActiveFeature] = useState(0);
  const observerRef = useRef(null);
  
  useEffect(() => {
    if (currentUser) {
      const defaultPath = isVendorUser(currentUser) ? '/drop' : '/';
      const from = location.state?.from?.pathname || defaultPath;
      navigate(from, { replace: true });
    }
  }, [currentUser, navigate, location]);
  
  useEffect(() => {
    if (error) {
      setErrorMessage(error);
    }
  }, [error]);
  
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );
    
    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach((el) => observerRef.current.observe(el));
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 4);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);
  
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
      const response = await axios.post('/api/auth/login', {
        username,
        password
      });
      
      if (response.data.requiresPasswordChange) {
        setRequiresPasswordChange(true);
        setPasswordChangeUserId(response.data.userId);
        setPasswordChangeUsername(response.data.username);
        setPasswordChangeToken(response.data.passwordChangeToken);
        setIsLoading(false);
        return;
      }
      
      const success = await login(username, password);
      
      if (success) {
      } else {
        setLoginFailed(true);
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error.response?.data?.message) {
        setErrorMessage(error.response.data.message);
      } else {
        setErrorMessage('Failed to login. Please check your credentials.');
      }
      setLoginFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOktaLogin = async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');
      window.location.href = getSecret('OKTA_DOMAIN') || '';
    } catch (error) {
      console.error('Okta login error:', error);
      setErrorMessage('Failed to initiate Okta login. Please try again.');
      setIsLoading(false);
    }
  };
  
  const handleForgotPassword = () => {
    setResetUsername(username);
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

  const handlePasswordChanged = () => {
    navigate('/', { replace: true });
  };

  if (requiresPasswordChange) {
    return (
      <PasswordChangeRequired
        userId={passwordChangeUserId}
        username={passwordChangeUsername}
        passwordChangeToken={passwordChangeToken}
        onPasswordChanged={handlePasswordChanged}
      />
    );
  }
  
  const features = [
    {
      title: 'Profile & Validate',
      description: 'Use statistics to understand the data',
      icon: '📊',
      color: '#7C3AED'
    },
    {
      title: 'Detect & Monitor',
      description: 'Use ML to automatically find data & metadata issues',
      icon: '🔍',
      color: '#2563EB'
    },
    {
      title: 'Transform & Orchestrate',
      description: 'Use ETL to clean and prepare data for analytics',
      icon: '⚙️',
      color: '#059669'
    },
    {
      title: 'Alert & Govern',
      description: 'Use ML to generate rules for data validation',
      icon: '🔔',
      color: '#DC2626'
    }
  ];
  
  return (
    <div className="login-page">
      <div className="marketing-content">
        <div className="marketing-scroll-container">
          <div className="hero-section animate-on-scroll">
            <div className="hero-badge">FILESENSE</div>
            <h1 className="hero-title">
              End-to-end file data quality, governance, and observability — with minimal operational effort.
            </h1>
            <p className="hero-subtitle">
              Blumetra FileSense is exactly what data professionals need to make sure that the data can be trusted by the business. Built for data engineering, governance, and compliance teams, FileSense ensures that every file ingested into your enterprise pipeline is trustworthy, validated, governed, and observable — from the moment it lands to its final destination.
            </p>
            
            <div className="data-flow-animation">
              <div className="flow-item">
                <div className="flow-icon">☁️</div>
                <div className="flow-label">Cloud Data</div>
              </div>
              <div className="flow-arrow">→</div>
              <div className="flow-item">
                <div className="flow-icon">📁</div>
                <div className="flow-label">Files</div>
              </div>
              <div className="flow-arrow">→</div>
              <div className="flow-item">
                <div className="flow-icon">📱</div>
                <div className="flow-label">SaaS Apps</div>
              </div>
            </div>
          </div>
          
          <div className="features-showcase">
            <div className="showcase-header animate-on-scroll">
              <h2>FileSense Platform</h2>
              <p>Comprehensive data governance and quality at your fingertips</p>
            </div>
            
            <div className="features-grid">
              {features.map((feature, index) => (
                <div
                  key={`feature-${feature.title || feature.name || index}`}
                  className={`feature-card animate-on-scroll ${index === activeFeature ? 'active' : ''}`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="feature-icon" style={{ background: feature.color }}>
                    {feature.icon}
                  </div>
                  <div className="feature-content">
                    <div className="feature-bullet">●</div>
                    <div className="feature-title">{feature.title}</div>
                    <div className="feature-description">{feature.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="stats-section animate-on-scroll">
            <div className="stat-item">
              <div className="stat-number">15+</div>
              <div className="stat-label">File Formats Supported</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">27+</div>
              <div className="stat-label">Data Transformations</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">100%</div>
              <div className="stat-label">Enterprise Security</div>
            </div>
          </div>
          
          <div className="capabilities-section animate-on-scroll">
            <h3>Integrated. Modular. Built for Data Products.</h3>
            <div className="capabilities-grid">
              <div className="capability-item">
                <span className="capability-number">01</span>
                <h4>Vendor Integration</h4>
                <p>Seamless vendor onboarding with agreement-level schema validation and governance</p>
              </div>
              <div className="capability-item">
                <span className="capability-number">02</span>
                <h4>Data Quality</h4>
                <p>Continuous monitoring, verification, and reconciliation for trusted data</p>
              </div>
              <div className="capability-item">
                <span className="capability-number">03</span>
                <h4>ETL Pipeline</h4>
                <p>Streamline data operations with unified integration and transformation</p>
              </div>
              <div className="capability-item">
                <span className="capability-number">04</span>
                <h4>Real-time Alerts</h4>
                <p>Cloud-agnostic email notifications for job, workflow, and quality monitoring</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="login-panel">
        <div className="login-card-glass">
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
            <h2>FileSense</h2>
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
  
          <div className="login-divider">
            <span>OR</span>
          </div>

          <button 
            type="submit" 
            className="login-button"
            onClick={handleOktaLogin}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? 'Signing In...' : 'Sign In with Okta'}
          </button>
        </form>
        </div>
      </div>
      
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
