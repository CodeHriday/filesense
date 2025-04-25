/**
 * Login Page
 * 
 * A page that allows users to log in to the application.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToastContext } from '../../context/ToastContext';
import { Button } from '../../components/ui/atoms/buttons/Button';
import { Input } from '../../components/ui/atoms/inputs/Input';
import { Typography, TYPOGRAPHY_VARIANTS } from '../../components/ui/atoms/typography/Typography';
import { Form } from '../../components/ui/molecules/forms/Form';
import '../../styles/Login.css';

const Login = () => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  
  const { login, isLoading } = useAuth();
  const toast = useToastContext();
  const navigate = useNavigate();
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value,
    }));
    
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }));
    }
  };
  
  const validate = () => {
    const newErrors = {};
    
    if (!credentials.username) {
      newErrors.username = 'Username is required';
    }
    
    if (!credentials.password) {
      newErrors.password = 'Password is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e) => {
    // Make sure we safely prevent the default form action
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    
    if (!validate()) return;
    
    try {
      console.log('Attempting to log in with:', credentials);
      await login(credentials);
      
      // Only show success toast if toast is properly initialized
      if (toast && typeof toast.showSuccess === 'function') {
        toast.showSuccess('Logged in successfully');
      } else {
        console.log('Login successful!');
      }
      
      // Navigate to dashboard after successful login
      navigate('/dashboard');
    } catch (error) {
      console.error('Login attempt failed:', error);
      
      // Only show error toast if toast is properly initialized
      if (toast && typeof toast.showError === 'function') {
        toast.showError(error.message || 'Login failed. Please try again.');
      } else {
        alert('Login failed: ' + (error.message || 'Please try again.'));
      }
    }
  };
  
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.svg" alt="Data File Observatory" className="login-logo" />
          <h2>Data File Observatory</h2>
          <h3>Welcome back!</h3>
        </div>
        
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              value={credentials.username}
              onChange={handleChange}
              required
            />
            {errors.username && <div className="login-error">{errors.username}</div>}
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={credentials.password}
              onChange={handleChange}
              required
            />
            {errors.password && <div className="login-error">{errors.password}</div>}
          </div>
          
          <button
            type="submit"
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        
        <div className="login-help">
          <p>
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
          <p>
            Don't have an account? <Link to="/register"><strong>Sign up</strong></Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;