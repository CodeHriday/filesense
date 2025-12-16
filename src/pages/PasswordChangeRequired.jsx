import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import PasswordInput from '../components/PasswordInput';
import '../styles/Login.css';
import PropTypes from 'prop-types';


const PasswordChangeRequired = ({ userId, username, passwordChangeToken, onPasswordChanged }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [passwordRequirements, setPasswordRequirements] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    fetchPasswordRequirements();
  }, []);

  const fetchPasswordRequirements = async () => {
    try {
      const response = await axios.get('/api/users/password-requirements');
      setPasswordRequirements(response.data);
    } catch (error) {
      console.error('Failed to fetch password requirements:', error);
    }
  };

  const validatePassword = (password) => {
    if (!passwordRequirements) return true;

    const errors = [];

    if (password.length < passwordRequirements.minLength) {
      errors.push(`Password must be at least ${passwordRequirements.minLength} characters`);
    }

    if (passwordRequirements.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (passwordRequirements.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (passwordRequirements.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (passwordRequirements.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      setErrorMessage('Both password fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    const validationErrors = validatePassword(newPassword);
    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors.join('. '));
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await axios.post('/api/users/change-password-required', {
        userId,
        newPassword,
        passwordChangeToken
      });

      if (response.data.success) {
        const loginSuccess = await login(username, newPassword);
        
        if (loginSuccess) {
          if (onPasswordChanged) {
            onPasswordChanged();
          }
        } else {
          setErrorMessage('Password changed but login failed. Please try logging in manually.');
        }
      }
    } catch (error) {
      console.error('Password change error:', error);
      setErrorMessage(error.response?.data?.message || 'Failed to change password. Please try again.');
    } finally {
      setIsLoading(false);
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
          <h3>Password Change Required</h3>
        </div>

        <div className="password-change-notice">
          <p>Your account requires a password change before you can continue.</p>
          <p className="notice-username">Logged in as: <strong>{username}</strong></p>
        </div>

        {errorMessage && (
          <div className="error-message">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              disabled={isLoading}
            />
          </div>

          {passwordRequirements && (
            <div className="password-requirements">
              <p><strong>Password Requirements:</strong></p>
              <ul>
                <li>At least {passwordRequirements.minLength} characters</li>
                {passwordRequirements.requireUppercase && <li>One uppercase letter</li>}
                {passwordRequirements.requireLowercase && <li>One lowercase letter</li>}
                {passwordRequirements.requireNumbers && <li>One number</li>}
                {passwordRequirements.requireSpecialChars && <li>One special character</li>}
              </ul>
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? 'Changing Password...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
};
PasswordChangeRequired.propTypes = {
  userId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  username: PropTypes.string.isRequired,
  passwordChangeToken: PropTypes.string.isRequired,
  onPasswordChanged: PropTypes.func
};

export default PasswordChangeRequired;
